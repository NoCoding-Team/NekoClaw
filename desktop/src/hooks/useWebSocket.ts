/**
 * WebSocket client with auto-reconnect (exponential backoff).
 * Handles all server events and dispatches them into Zustand store.
 */
import { useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore, ToolCall } from '../store/app'
import { executeLocalTool } from './localTools'
import { apiFetch } from '../api/apiFetch'

const MAX_BACKOFF = 30_000

// Module-level ref kept in sync by the hook, used by confirmTool/denyTool
let _ws: WebSocket | null = null

// Per-session set: tracks sessions for which local_history was already sent
const _localHistorySentForSession = new Set<string>()

// Ephemeral WS sessions: maps local session ID → server session ID.
// When syncEnabled=false, a server session is created only for WS transport;
// the frontend keeps the session as "local-*" and backend skips persistence.
const _ephemeralServerMap: Record<string, string> = {}

// Per-round tool call tracking for loop guard & call limit
const _roundToolCount: Record<string, number> = {}         // sessionId → count in current round
const _recentTools: Record<string, string[]> = {}          // sessionId → recent tool names (window)
// 跟踪 callId → 本地 SQLite 消息 ID 的映射，用于工具执行完毕后更新持久化状态
const _callIdToMsgId: Record<string, string> = {}
// 已触发过 Stage 2 标题生成的会话集合
const _titleGenerated = new Set<string>()

function resetRound(sessionId: string) {
  _roundToolCount[sessionId] = 0
  _recentTools[sessionId] = []
}

/** Returns true if a loop is detected based on sensitivity */
function detectLoop(sessionId: string, toolName: string, sensitivity: 'strict' | 'default' | 'loose'): boolean {
  const window = { strict: 3, default: 5, loose: 8 }[sensitivity]
  const recent = _recentTools[sessionId] ?? []
  if (recent.length < window) return false
  const last = recent.slice(-window)
  return last.every((t) => t === toolName)
}

export function useWebSocket(sessionId: string | null) {
  const {
    token,
    serverUrl,
    setCatState,
    setWsStatus,
    appendMessage,
    updateLastAssistantToken,
    updateToolCallStatus,
  } = useAppStore()

  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef(1_000)
  const intentionalClose = useRef(false)
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamingMsgId = useRef<string | null>(null)
  const wsUrlRef = useRef<string | null>(null)
  /** 标记当前是否有消息等待回复（发送后→收到 llm_done 前） */
  const waitingReply = useRef(false)
  /** 回复超时计时器 */
  const replyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 待发的第一条消息（local- 会话 materialized 后在 onopen 中发送） */
  const pendingMessage = useRef<{
    content: string
    skillId?: string | null
    allowedTools?: string[] | null
    ephemeral?: boolean
    localHistory?: Array<{ role: string; content: string }>
  } | null>(null)
  /** local history to include as fallback for newly materialized sessions */
  const pendingLocalHistory = useRef<Array<{ role: string; content: string }> | null>(null)

  /** 启动回复超时：45s 没收到 llm_token/llm_done 则注入错误提示 */
  const startReplyTimeout = () => {
    if (replyTimeoutRef.current) clearTimeout(replyTimeoutRef.current)
    replyTimeoutRef.current = setTimeout(() => {
      if (!waitingReply.current) return
      waitingReply.current = false
      streamingMsgId.current = null
      setCatState('idle')
      const sid = useAppStore.getState().activeSessionId
      if (!sid) return
      // 清理可能存在的空 streaming 气泡
      const msgs = useAppStore.getState().messagesBySession[sid] ?? []
      const cleaned = msgs.filter(m => !(m.role === 'assistant' && m.streaming && !m.content))
      if (cleaned.length !== msgs.length) {
        useAppStore.getState().setMessages(sid, cleaned)
      }
      const last = cleaned[cleaned.length - 1]
      if (!last || last.role !== 'assistant') {
        appendMessage(sid, { id: uuidv4(), role: 'assistant', content: '⚠️ 回复超时，请检查后端服务或网络，然后重试。' })
      }
      console.warn('[WS] 回复超时（45s 未收到 llm_token/llm_done）')
    }, 45_000)
  }

  const connect = useCallback(() => {
    if (!token || !sessionId) return
    // For local sessions, check ephemeral map for a server session to use for WS
    let wsSessionId = sessionId
    if (sessionId.startsWith('local-')) {
      const mapped = _ephemeralServerMap[sessionId]
      if (!mapped) return  // no ephemeral mapping yet, can't connect
      wsSessionId = mapped
    }
    const wsUrl = serverUrl.replace(/^http/, 'ws') + `/api/ws/${wsSessionId}?token=${token}`

    // Already connected/connecting to the same URL, skip duplicate connect.
    if (
      wsRef.current
      && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
      && wsUrlRef.current === wsUrl
    ) {
      return
    }

    // Switching targets: close old socket intentionally before creating a new one.
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      intentionalClose.current = true
      try { wsRef.current.close() } catch {}
    }

    setWsStatus('connecting')
    streamingMsgId.current = null   // reset stale streaming state from previous session

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    _ws = ws
    wsUrlRef.current = wsUrl
    intentionalClose.current = false

    ws.onopen = () => {
      if (wsRef.current !== ws) return
      backoffRef.current = 1_000
      setWsStatus('connected')
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'ping' }))
      }, 30_000)
      // Restore embedding config for knowledge module
      try {
        const embCfg = localStorage.getItem('embeddingConfig')
        if (embCfg) {
          const parsed = JSON.parse(embCfg)
          window.nekoBridge?.knowledge?.setEmbeddingConfig(parsed).catch(() => {})
        }
      } catch { /* ignore */ }
      // 发送带入的待发消息（local- 会话 第一条消息）
      if (pendingMessage.current) {
        const { content, skillId, allowedTools, ephemeral: eph, localHistory: lh } = pendingMessage.current
        const localHistory = lh ?? pendingLocalHistory.current
        pendingMessage.current = null
        pendingLocalHistory.current = null
        const sid = useAppStore.getState().activeSessionId!
        // 若 handleSend 已乐观写入该条消息（新对话场景），跳过重复追加
        const existingMsgs = useAppStore.getState().messagesBySession[sid] ?? []
        const lastExisting = existingMsgs[existingMsgs.length - 1]
        if (!(lastExisting?.role === 'user' && lastExisting.content === content)) {
          appendMessage(sid, { id: uuidv4(), role: 'user', content })
        }
        // Write user message to local SQLite for the new server session (skip for ephemeral — already written)
        if (!eph) {
          const dbBridge = window.nekoBridge?.db
          if (dbBridge && sid) {
            const sTitle = useAppStore.getState().sessions.find((s) => s.id === sid)?.title ?? ''
            dbBridge.upsertSession(sid, sTitle, Date.now()).catch(() => {})
            dbBridge.insertMessage({ id: uuidv4(), sessionId: sid, role: 'user', content, toolCalls: null, tokenCount: content.length, createdAt: Date.now() }).catch(() => {})
          }
        }
        if (sid) _localHistorySentForSession.add(sid)
        waitingReply.current = true
        startReplyTimeout()
        ws.send(JSON.stringify({
          event: 'message', content, skill_id: skillId ?? null, allowed_tools: allowedTools ?? null,
          ...(eph ? { ephemeral: true } : {}),
          ...(localHistory?.length ? { local_history: localHistory } : {}),
          ...((() => {
            const { customLLMConfig } = useAppStore.getState()
            if (!customLLMConfig.enabled || !customLLMConfig.model || !customLLMConfig.api_key) return {}
            return {
              custom_llm_config: {
                provider: customLLMConfig.provider,
                model: customLLMConfig.model,
                api_key: customLLMConfig.api_key,
                base_url: customLLMConfig.base_url || null,
                temperature: customLLMConfig.temperature,
                context_limit: customLLMConfig.context_limit,
              },
            }
          })()),
        }))
      }
    }

    ws.onmessage = async (ev) => {
      if (wsRef.current !== ws) {
        // 事件到达但 WS 已被替换——记录警告帮助排查丢消息
        try {
          const d = JSON.parse(ev.data); if (d.event !== 'pong') console.warn('[WS] 事件被丢弃（旧连接）:', d.event)
        } catch { /* ignore */ }
        return
      }
      let evt: Record<string, unknown>
      try {
        evt = JSON.parse(ev.data)
      } catch {
        return
      }
      const type = evt.event as string

      // Debug logging — 帮助排查消息流
      if (type !== 'pong' && type !== 'ping') {
        console.debug('[WS]', type, type === 'llm_token' ? `"${(evt.token as string)?.slice(0, 30)}"` : JSON.stringify(evt).slice(0, 120))
      }

      if (type === 'cat_state') {
        setCatState(evt.state as any)
        // 标题两段式 Stage 2：第一轮对话 finalize 后，调用 LLM 生成摘要标题
        if (evt.state === 'success' && sessionId) {
          if (_titleGenerated.has(sessionId)) {
            console.log('[Title] Stage 2 跳过：已生成过标题', sessionId)
          } else {
            const allMsgs = useAppStore.getState().messagesBySession[sessionId] ?? []
            const userMsgCount = allMsgs.filter(m => m.role === 'user').length
            console.log('[Title] Stage 2 检查:', { sessionId, userMsgCount, msgCount: allMsgs.length })
            if (userMsgCount === 1) {
              _titleGenerated.add(sessionId)
              const firstUserMsg = allMsgs.find(m => m.role === 'user')
              const lastAiMsg = [...allMsgs].reverse().find(m => m.role === 'assistant' && m.content && !m.streaming)
              console.log('[Title] Stage 2 消息:', {
                firstUser: firstUserMsg?.content?.slice(0, 30),
                lastAi: lastAiMsg?.content?.slice(0, 30),
                lastAiStreaming: lastAiMsg?.streaming,
              })
              if (firstUserMsg && lastAiMsg) {
                const { serverUrl: sv, customLLMConfig } = useAppStore.getState()
                const body: Record<string, unknown> = {
                  user_message: firstUserMsg.content,
                  ai_reply: lastAiMsg.content,
                }
                if (customLLMConfig.enabled && customLLMConfig.model && customLLMConfig.api_key) {
                  body.custom_llm_config = {
                    provider: customLLMConfig.provider,
                    model: customLLMConfig.model,
                    api_key: customLLMConfig.api_key,
                    base_url: customLLMConfig.base_url || null,
                    temperature: customLLMConfig.temperature,
                  }
                }
                console.log('[Title] Stage 2 发起请求:', `${sv}/api/sessions/generate-title`, { hasCustomLLM: !!body.custom_llm_config })
                apiFetch(`${sv}/api/sessions/generate-title`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                })
                  .then(async (r) => {
                    const data = await r.json()
                    console.log('[Title] Stage 2 响应:', { status: r.status, data })
                    if (data.title) {
                      useAppStore.getState().updateSessionTitle(sessionId!, data.title)
                      const dbBridge = window.nekoBridge?.db
                      if (dbBridge) {
                        dbBridge.upsertSession(sessionId!, data.title, Date.now()).catch(() => {})
                      }
                      // Sync title to server DB (session may start as "新对话")
                      const { serverUrl: svPatch, token: tkPatch } = useAppStore.getState()
                      if (tkPatch && sessionId && !sessionId.startsWith('local-')) {
                        apiFetch(`${svPatch}/api/sessions/${sessionId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ title: data.title }),
                        }).catch(() => {})
                      }
                    }
                  })
                  .catch((err) => console.warn('[Title] Stage 2 请求失败:', err))
              } else {
                console.warn('[Title] Stage 2 跳过：缺少用户/AI 消息', { hasUser: !!firstUserMsg, hasAi: !!lastAiMsg })
              }
            }
          }
        }
      } else if (type === 'llm_thinking') {
        // 仅设状态，不预先创建 streaming 气泡——防止工具卡插入后 token 丢失
        setCatState('thinking')
        // 为后续轮次（工具循环后的第二次 LLM 调用）重新启动超时保护
        startReplyTimeout()
      } else if (type === 'llm_token') {
        if (!streamingMsgId.current) {
          // 首个 token 到达时创建气泡（工具卡已在其前，此时 append 就是最后一条）
          const id = uuidv4()
          streamingMsgId.current = id
          appendMessage(sessionId!, { id, role: 'assistant', content: '', streaming: true })
        }
        updateLastAssistantToken(sessionId!, evt.token as string)
      } else if (type === 'llm_done') {
        const hadStreaming = !!streamingMsgId.current
        const hasToolCalls = !!evt.has_tool_calls
        streamingMsgId.current = null
        waitingReply.current = false
        if (replyTimeoutRef.current) { clearTimeout(replyTimeoutRef.current); replyTimeoutRef.current = null }
        // 清除幽灵空 streaming 消息，将最后一条标记为完成
        const sid = sessionId!
        const msgs = useAppStore.getState().messagesBySession[sid] ?? []
        const cleanedMsgs = msgs.filter(m => !(m.role === 'assistant' && m.streaming && !m.content))
        const last = cleanedMsgs[cleanedMsgs.length - 1]

        // LLM 只返回了工具调用（无文本 token）：不报错、不设 idle，后续 tool_call 事件会处理
        if (hasToolCalls) {
          if (hadStreaming && last?.streaming) {
            // 有文本 + 有工具：先把文本气泡标记为完成
            useAppStore.getState().setMessages(sid, [
              ...cleanedMsgs.slice(0, -1),
              { ...last, streaming: false },
            ])
          } else if (cleanedMsgs.length !== msgs.length) {
            useAppStore.getState().setMessages(sid, cleanedMsgs)
          }
          return
        }

        // 无工具调用，本轮 LLM 输出结束，重置为 idle
        setCatState('idle')

        // 如果本轮完全没有收到 token 且没有 streaming 气泡，插入一条回退提示
        // （常见原因：后端 LLM 返回空内容、WS 中途重连丢失 token 等）
        if (!hadStreaming && (!last || last.role !== 'assistant')) {
          appendMessage(sid, { id: uuidv4(), role: 'assistant', content: '⚠️ 未收到回复，请重试' })
          return
        }

        if (last?.streaming) {
          const finalContent = last.content
          // 若 streaming 消息最终内容为空（LLM 返回空、网络丢 token 等），
          // 移除空气泡并插入错误提示，而非保留一个不可见的空消息
          if (!finalContent?.trim()) {
            const withoutEmpty = cleanedMsgs.slice(0, -1)
            useAppStore.getState().setMessages(sid, [
              ...withoutEmpty,
              { id: uuidv4(), role: 'assistant' as const, content: '⚠️ LLM 返回了空内容，请重试。' },
            ])
            return
          }
          useAppStore.getState().setMessages(sid, [
            ...cleanedMsgs.slice(0, -1),
            { ...last, streaming: false },
          ])
          // Write assistant message to local SQLite
          const dbBridge = window.nekoBridge?.db
          if (dbBridge) {
            dbBridge.insertMessage({ id: uuidv4(), sessionId, role: 'assistant', content: finalContent, toolCalls: null, tokenCount: finalContent.length, createdAt: Date.now() }).catch(() => {})
          }
          // 自动批量同步（当 syncEnabled=true 时）
          // 后端 agent 已经持久化了本次消息，只需标记本地 SQLite 为已同步，
          // 避免再次 POST 到 /messages/batch 造成重复写入。
          const { syncEnabled, token: tkSync } = useAppStore.getState()
          if (syncEnabled && tkSync && dbBridge) {
            dbBridge.markSynced(sessionId).catch(() => {})
          }
          // Stage 2 标题生成由 cat_state:success 处理器触发
        } else if (hadStreaming && cleanedMsgs.length !== msgs.length) {
          // hadStreaming=true 但 streaming 消息被清理（空内容）→ LLM 返回空
          // 典型场景：工具执行后第二轮 LLM 调用返回空内容
          useAppStore.getState().setMessages(sid, [
            ...cleanedMsgs,
            { id: uuidv4(), role: 'assistant' as const, content: '⚠️ LLM 返回了空内容，请重试。' },
          ])
        } else if (cleanedMsgs.length !== msgs.length) {
          // 无 streaming 消息，但幽灵气泡未清理，补一次 setMessages
          useAppStore.getState().setMessages(sid, cleanedMsgs)
        }
      } else if (type === 'server_tool_call') {
        // Server-side tool: display card only, no local execution
        const tc: ToolCall = {
          callId: evt.call_id as string,
          tool: evt.tool as string,
          args: evt.args as Record<string, unknown>,
          riskLevel: ((evt.risk_level as string) || 'LOW') as any,
          status: 'executing',
        }
        const toolMsgId = uuidv4()
        _callIdToMsgId[evt.call_id as string] = toolMsgId
        appendMessage(sessionId!, { id: toolMsgId, role: 'tool', content: '', toolCalls: [tc] })
        // 持久化工具调用消息到本地 SQLite
        const dbBridgeStc = window.nekoBridge?.db
        if (dbBridgeStc && sessionId) {
          dbBridgeStc.insertMessage({ id: toolMsgId, sessionId, role: 'tool', content: '', toolCalls: JSON.stringify([tc]), tokenCount: 0, createdAt: Date.now() }).catch(() => {})
        }
      } else if (type === 'server_tool_done') {
        const doneCallId = evt.call_id as string
        updateToolCallStatus(sessionId!, doneCallId, {
          status: 'done',
          result: (evt.result as string) || '',
        })
        // 更新本地 SQLite 中的工具调用状态
        const doneMsgId = _callIdToMsgId[doneCallId]
        if (doneMsgId) {
          const dbBridgeDone = window.nekoBridge?.db
          if (dbBridgeDone) {
            // 从 store 中获取更新后的 toolCalls
            const allMsgs = useAppStore.getState().messagesBySession[sessionId!] ?? []
            const toolMsg = allMsgs.find(m => m.id === doneMsgId)
            if (toolMsg?.toolCalls) {
              dbBridgeDone.updateMessageToolCalls?.(doneMsgId, JSON.stringify(toolMsg.toolCalls)).catch(() => {})
            }
          }
          delete _callIdToMsgId[doneCallId]
        }
      } else if (type === 'check_local_index') {
        // Dynamic routing: server asks if client has local knowledge index
        const checkCallId = evt.call_id as string
        const query = evt.query as string
        const topK = (evt.top_k as number) || 5
        ;(async () => {
          try {
            const indexStatus = await window.nekoBridge.knowledge.hasIndex()
            if (!indexStatus.hasIndex) {
              ws.send(JSON.stringify({ event: 'check_local_index_result', call_id: checkCallId, has_index: false, results: [] }))
              return
            }
            const searchResult = await window.nekoBridge.knowledge.search(query, topK)
            ws.send(JSON.stringify({
              event: 'check_local_index_result',
              call_id: checkCallId,
              has_index: true,
              results: searchResult.results ?? [],
            }))
          } catch {
            ws.send(JSON.stringify({ event: 'check_local_index_result', call_id: checkCallId, has_index: false, results: [] }))
          }
        })()
      } else if (type === 'tool_call') {
        // ── Auto-execute decision (computed FIRST, before card creation) ──
        const callId = evt.call_id as string
        const toolName = evt.tool as string
        const args = evt.args as Record<string, unknown>
        const riskLevel = (evt.risk_level as string) || 'LOW'
        const reason = evt.reason as string | undefined

        const { securityConfig } = useAppStore.getState()
        const inToolWhitelist = securityConfig.toolWhitelist.includes(toolName)
        const THRESHOLD_AUTO: Record<string, string[]> = {
          'off':    ['LOW', 'MEDIUM', 'HIGH'],
          'HIGH':   ['LOW', 'MEDIUM'],
          'MEDIUM': ['LOW'],
          'LOW':    [],
        }
        const autoByThreshold = (THRESHOLD_AUTO[securityConfig.sandboxThreshold ?? 'MEDIUM'] ?? ['LOW']).includes(riskLevel)
        // 命令白名单作为"免检通行证"：在白名单中的命令无论 risk_level 都自动执行
        let inCommandWhitelist = false
        if (toolName === 'shell_exec' && securityConfig.commandWhitelist.length > 0) {
          const cmd = String(args.command ?? '')
          const cmdBase = cmd.trim().split(/\s+/)[0]
          inCommandWhitelist = securityConfig.commandWhitelist.some(
            (w) => cmdBase === w || cmd.trimStart().startsWith(w + ' ')
          )
        }
        const autoRun = securityConfig.fullAccessMode || inCommandWhitelist || autoByThreshold

        console.log('[WS] tool_call received:', {
          callId, toolName, riskLevel, autoRun,
          autoByThreshold, inCommandWhitelist,
          sandboxThreshold: securityConfig.sandboxThreshold,
          fullAccessMode: securityConfig.fullAccessMode,
          inToolWhitelist,
          sessionId,
        })

        // ── Create card with correct initial status ──────────────────
        const tc: ToolCall = {
          callId,
          tool: toolName,
          args,
          riskLevel: riskLevel as any,
          reason,
          status: autoRun ? 'executing' : 'pending',
        }

        const toolMsgIdCt = uuidv4()
        _callIdToMsgId[callId] = toolMsgIdCt
        appendMessage(sessionId, {
          id: toolMsgIdCt,
          role: 'tool',
          content: '',
          toolCalls: [tc],
        })
        // 持久化工具调用消息到本地 SQLite
        const dbBridgeCt = window.nekoBridge?.db
        if (dbBridgeCt && sessionId) {
          dbBridgeCt.insertMessage({ id: toolMsgIdCt, sessionId, role: 'tool', content: '', toolCalls: JSON.stringify([tc]), tokenCount: 0, createdAt: Date.now() }).catch(() => {})
        }

        // ── Loop guard ───────────────────────────────────────────────
        if (securityConfig.loopGuard) {
          const recent = _recentTools[sessionId] ?? []
          _recentTools[sessionId] = [...recent, toolName].slice(-20)
          if (detectLoop(sessionId, toolName, securityConfig.loopGuardSensitivity)) {
            useAppStore.getState().updateToolCallStatus(sessionId, callId, {
              status: 'error',
              result: '[循环守卫] 检测到重复调用循环，已自动中止',
            })
            ws.send(JSON.stringify({
              event: 'tool_result',
              call_id: callId,
              error: '[LoopGuard] Repeated tool call loop detected and aborted',
            }))
            return
          }
        }

        // ── Call limit ───────────────────────────────────────────────
        _roundToolCount[sessionId] = (_roundToolCount[sessionId] ?? 0) + 1
        if (_roundToolCount[sessionId] > securityConfig.maxToolCallsPerRound) {
          useAppStore.getState().updateToolCallStatus(sessionId, callId, {
            status: 'error',
            result: `[调用上限] 本轮已超过 ${securityConfig.maxToolCallsPerRound} 次工具调用上限`,
          })
          ws.send(JSON.stringify({
            event: 'tool_result',
            call_id: callId,
            error: `[CallLimit] Exceeded max tool calls (${securityConfig.maxToolCallsPerRound}) per round`,
          }))
          return
        }

        // ── Execute ──────────────────────────────────────────────────
        if (autoRun) {
          if (inToolWhitelist) {
            useAppStore.getState().incrementToolCallCount(toolName)
          }
          try {
            await _executeAndReply(ws, sessionId, tc, callId, toolMsgIdCt)
          } catch (err) {
            console.error('[WS] tool auto-execute failed:', err)
            useAppStore.getState().updateToolCallStatus(sessionId, callId, {
              status: 'error',
              result: `自动执行失败: ${err}`,
            })
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: 'tool_result', call_id: callId, error: String(err) }))
            }
          }
        }
        // Non-autoRun tools: confirm/deny buttons shown in ToolCallCard
      } else if (type === 'tool_denied') {
        updateToolCallStatus(sessionId, evt.call_id as string, { status: 'denied' })
      } else if (type === 'tool_error') {
        updateToolCallStatus(sessionId, evt.call_id as string, {
          status: 'error',
          result: evt.error as string,
        })
      } else if (type === 'pong') {
        // heartbeat ok
      } else if (type === 'title_update') {
        const sid = evt.session_id as string
        const title = evt.title as string
        if (sid && title) {
          // Reverse-lookup: if this server session maps to a local session, target the local one
          let targetSid = sid
          for (const [localId, serverId] of Object.entries(_ephemeralServerMap)) {
            if (serverId === sid) { targetSid = localId; break }
          }
          useAppStore.getState().updateSessionTitle(targetSid, title)
          // Also update local SQLite
          const dbBridge = window.nekoBridge?.db
          if (dbBridge) {
            dbBridge.upsertSession(targetSid, title, Date.now()).catch(() => {})
          }
        }
      }
    }

    ws.onclose = () => {
      if (pingTimer.current) clearInterval(pingTimer.current)

      // Ignore stale sockets closed after a newer socket has been created.
      if (wsRef.current !== ws) return

      // 如果断连时仍在等待回复，注入错误提示气泡
      const wasWaiting = waitingReply.current || !!streamingMsgId.current
      if (wasWaiting && sessionId && !intentionalClose.current) {
        const sid = sessionId
        const msgs = useAppStore.getState().messagesBySession[sid] ?? []
        // 查找正在 streaming 的 assistant 消息
        const lastStreaming = [...msgs].reverse().find(m => m.role === 'assistant' && m.streaming)
        if (lastStreaming && lastStreaming.content) {
          // 有部分内容的 streaming 消息——标记完成保留内容
          useAppStore.getState().setMessages(sid, msgs.map(m =>
            m.id === lastStreaming.id ? { ...m, streaming: false } : m
          ))
        } else {
          // 完全没收到内容——清理空 streaming 气泡并插入错误提示
          const cleaned = msgs.filter(m => !(m.role === 'assistant' && m.streaming && !m.content))
          useAppStore.getState().setMessages(sid, [
            ...cleaned,
            { id: uuidv4(), role: 'assistant' as const, content: '⚠️ 连接断开，未收到回复。请重新发送消息。' },
          ])
        }
      }

      wsRef.current = null
      _ws = null
      wsUrlRef.current = null
      setWsStatus('disconnected')
      streamingMsgId.current = null
      waitingReply.current = false
      if (replyTimeoutRef.current) { clearTimeout(replyTimeoutRef.current); replyTimeoutRef.current = null }
      setCatState('idle')

      // 清理服务端临时会话，避免它们出现在会话列表中
      if (sessionId && sessionId.startsWith('local-')) {
        const ephServerId = _ephemeralServerMap[sessionId]
        if (ephServerId && intentionalClose.current) {
          const { serverUrl: sv } = useAppStore.getState()
          apiFetch(`${sv}/api/sessions/${ephServerId}`, { method: 'DELETE' }).catch(() => {})
          delete _ephemeralServerMap[sessionId]
        }
      }

      // Skip reconnect if this was an intentional close (e.g. session changed)
      if (intentionalClose.current) return
      // Exponential backoff reconnect
      reconnectTimer.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
        connect()
      }, backoffRef.current)
    }

    ws.onerror = () => {
      if (wsRef.current !== ws) return
      ws.close()
    }
  }, [token, sessionId, serverUrl]) // eslint-disable-line

  // (Re)connect when deps change.
  // When sessionId changes, connect is recreated and the old WS must be closed
  // to prevent sendMessage from accidentally sending through a stale connection
  // belonging to the previous session.
  useEffect(() => {
    // Capture the current sessionId so the cleanup can reference the OLD session
    // (the cleanup runs when connect changes, i.e. when sessionId changes)
    const capturedSessionId = sessionId
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      // Eagerly delete the ephemeral server session on session switch.
      // We do this here rather than in ws.onclose to avoid a race condition:
      // intentionalClose.current is reset synchronously before onclose fires.
      if (capturedSessionId?.startsWith('local-')) {
        const ephServerId = _ephemeralServerMap[capturedSessionId]
        if (ephServerId) {
          const { serverUrl: sv, token: tk } = useAppStore.getState()
          if (tk) {
            apiFetch(`${sv}/api/sessions/${ephServerId}`, { method: 'DELETE' }).catch(() => {})
          }
          delete _ephemeralServerMap[capturedSessionId]
        }
      }
      // Close the old WS so wsRef.current doesn't point to a stale connection
      // from a different session.  connect() for a new local session may return
      // early (no ephemeral mapping yet), leaving wsRef.current dangling.
      if (wsRef.current) {
        intentionalClose.current = true
        try { wsRef.current.close() } catch {}
        wsRef.current = null
        _ws = null
        wsUrlRef.current = null
        intentionalClose.current = false
      }
    }
  }, [connect]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close the socket only when the component truly unmounts
  // (e.g. user navigates away from chat panel).
  useEffect(() => {
    return () => {
      intentionalClose.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pingTimer.current) clearInterval(pingTimer.current)
      if (replyTimeoutRef.current) clearTimeout(replyTimeoutRef.current)
      wsRef.current?.close()
      wsRef.current = null
      _ws = null
      wsUrlRef.current = null
    }
  }, [])

  const sendMessage = useCallback(
    async (content: string, skillId?: string | null) => {
      const currentSessionId = useAppStore.getState().activeSessionId
      if (!currentSessionId) return

      // ── Branch A: local session + sync OFF → ephemeral mode ──────
      if (currentSessionId.startsWith('local-') && !useAppStore.getState().syncEnabled) {
        const { serverUrl: sv, token: tk, securityConfig: sc } = useAppStore.getState()
        if (!tk) return
        try {
          const dbBridge = window.nekoBridge?.db

          // Build full local history for AI context
          let localHistory: Array<{ role: string; content: string }> = []
          if (dbBridge) {
            const localMsgs = await dbBridge.getMessages(currentSessionId)
            localHistory = localMsgs
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({ role: m.role, content: m.content }))
          }

          // Optimistic UI — skip only if handleSend *just* appended this exact user message
          // as the very last message (prevents duplicate bubble for the same send action)
          const existingMsgs = useAppStore.getState().messagesBySession[currentSessionId] ?? []
          const lastMsg = existingMsgs[existingMsgs.length - 1]
          const alreadyAppended = lastMsg?.role === 'user' && lastMsg.content === content
          const userMsgId = alreadyAppended ? lastMsg.id : uuidv4()
          if (!alreadyAppended) {
            appendMessage(currentSessionId, { id: userMsgId, role: 'user', content })
          }
          resetRound(currentSessionId)

          // 标题两段式 Stage 1：用户发出首条消息时立即截断作标题
          // Stage 2 在 cat_state:success 时由前端调用 API 生成
          const msgsAfterAppend = useAppStore.getState().messagesBySession[currentSessionId] ?? []
          const isFirstUserMsg = msgsAfterAppend.filter(m => m.role === 'user').length === 1
          if (isFirstUserMsg) {
            const stage1Title = content.slice(0, 15) + (content.length > 15 ? '…' : '')
            useAppStore.getState().updateSessionTitle(currentSessionId, stage1Title)
          }

          // Write to local SQLite
          if (dbBridge) {
            const sTitle = useAppStore.getState().sessions.find(s => s.id === currentSessionId)?.title ?? '新对话'
            dbBridge.upsertSession(currentSessionId, sTitle, Date.now()).catch(() => {})
            dbBridge.insertMessage({ id: userMsgId, sessionId: currentSessionId, role: 'user', content, toolCalls: null, tokenCount: content.length, createdAt: Date.now() }).catch(() => {})
          }

          // Include current message in history sent to backend
          localHistory.push({ role: 'user', content })

          // Create ephemeral server session for WS transport only (no message persistence)
          if (!_ephemeralServerMap[currentSessionId]) {
            const res = await apiFetch(`${sv}/api/sessions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: '临时会话' }),
            })
            if (!res.ok) {
              console.error('[WS] 创建临时会话失败:', res.status)
              appendMessage(currentSessionId, { id: uuidv4(), role: 'assistant', content: `⚠️ 无法连接到服务器（${res.status}），请检查后端服务是否正常运行。` })
              setCatState('idle')
              return
            }
            const s = await res.json()
            _ephemeralServerMap[currentSessionId] = s.id
          }

          setCatState('thinking')
          const allowedTools = sc.toolWhitelist

          // Build message payload
          const buildPayload = (): string => {
            const payload: Record<string, unknown> = {
              event: 'message', content, skill_id: skillId ?? null,
              allowed_tools: allowedTools, ephemeral: true, local_history: localHistory,
            }
            const { customLLMConfig } = useAppStore.getState()
            if (customLLMConfig.enabled && customLLMConfig.model && customLLMConfig.api_key) {
              payload.custom_llm_config = {
                provider: customLLMConfig.provider, model: customLLMConfig.model,
                api_key: customLLMConfig.api_key, base_url: customLLMConfig.base_url || null,
                temperature: customLLMConfig.temperature, context_limit: customLLMConfig.context_limit,
              }
            }
            return JSON.stringify(payload)
          }

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            // WS already connected (subsequent messages), send directly
            waitingReply.current = true
            startReplyTimeout()
            wsRef.current.send(buildPayload())
          } else {
            // First message: queue pending and (re)connect
            pendingMessage.current = { content, skillId, allowedTools, ephemeral: true, localHistory }
            if (wsRef.current) { intentionalClose.current = true; wsRef.current.close() }
            intentionalClose.current = false
            connect()
          }
        } catch (err) {
          console.error('[WS] sendMessage Branch A error:', err)
          appendMessage(currentSessionId, { id: uuidv4(), role: 'assistant', content: '⚠️ 发送消息失败，请检查网络连接。' })
          setCatState('idle')
        }
        return
      }

      // ── Branch B: local session + sync ON → materialize to server ─
      if (currentSessionId.startsWith('local-')) {
        const { serverUrl: sv, token: tk } = useAppStore.getState()
        if (!tk) return
        try {
          // Read local history before materializing
          const dbBridge = window.nekoBridge?.db
          let localHistory: Array<{ role: string; content: string }> | null = null
          if (dbBridge) {
            const localMsgs = await dbBridge.getMessages(currentSessionId)
            const filtered = localMsgs.filter((m) => m.role === 'user' || m.role === 'assistant')
            if (filtered.length > 0) {
              localHistory = filtered.map((m) => ({ role: m.role, content: m.content }))
            }
          }
          const res = await apiFetch(`${sv}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '新对话' }),
          })
          if (!res.ok) {
            console.error('[WS] Branch B 创建会话失败:', res.status)
            appendMessage(currentSessionId, { id: uuidv4(), role: 'assistant', content: `⚠️ 无法在服务器创建会话（${res.status}）。` })
            setCatState('idle')
            return
          }
          const s = await res.json()
          useAppStore.getState().replaceSession(currentSessionId, { id: s.id, title: s.title })
          // 清理本地 SQLite 里的 local-xxx 临时记录，防止重启后再次出现在侧边栏
          if (dbBridge) {
            dbBridge.deleteSession(currentSessionId).catch(() => {})
          }
          // Stage 1: 立即截断标题
          const stage1TitleB = content.slice(0, 15) + (content.length > 15 ? '…' : '')
          useAppStore.getState().updateSessionTitle(s.id, stage1TitleB)
          const { securityConfig: sc } = useAppStore.getState()
          const allowedTools = sc.toolWhitelist
          setCatState('thinking')
          pendingMessage.current = { content, skillId, allowedTools }
          pendingLocalHistory.current = localHistory
          resetRound(currentSessionId)
        } catch (err) {
          console.error('[WS] sendMessage Branch B error:', err)
          appendMessage(currentSessionId, { id: uuidv4(), role: 'assistant', content: '⚠️ 发送消息失败，请检查网络连接。' })
          setCatState('idle')
        }
        return
      }

      // ── Branch C: regular server session → direct send ────────────
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      setCatState('thinking')
      const userMsgId = uuidv4()
      appendMessage(sessionId!, { id: userMsgId, role: 'user', content })
      resetRound(sessionId!)      // Stage 1: 立即截断标题（第一条用户消息时）
      {
        const msgsNow = useAppStore.getState().messagesBySession[sessionId!] ?? []
        if (msgsNow.filter(m => m.role === 'user').length === 1) {
          const stage1TitleC = content.slice(0, 15) + (content.length > 15 ? '…' : '')
          useAppStore.getState().updateSessionTitle(sessionId!, stage1TitleC)
        }
      }      const { securityConfig } = useAppStore.getState()
      const allowedTools = securityConfig.toolWhitelist

      // Write user message to local SQLite
      const dbBridge = window.nekoBridge?.db
      if (dbBridge && sessionId) {
        const sTitle = useAppStore.getState().sessions.find((s) => s.id === sessionId)?.title ?? ''
        dbBridge.upsertSession(sessionId, sTitle, Date.now()).catch(() => {})
        dbBridge.insertMessage({ id: userMsgId, sessionId, role: 'user', content, toolCalls: null, tokenCount: content.length, createdAt: Date.now() }).catch(() => {})
      }

      // Include local history as fallback for the first message sent in this WS session
      let localHistoryPayload: Array<{ role: string; content: string }> | undefined
      if (dbBridge && sessionId && !_localHistorySentForSession.has(sessionId)) {
        const localMsgs = await dbBridge.getMessages(sessionId)
        const prevMsgs = localMsgs.filter((m) => m.id !== userMsgId && (m.role === 'user' || m.role === 'assistant'))
        if (prevMsgs.length > 0) {
          localHistoryPayload = prevMsgs.map((m) => ({ role: m.role, content: m.content }))
        }
        _localHistorySentForSession.add(sessionId)
      }

      waitingReply.current = true
      startReplyTimeout()
      wsRef.current.send(JSON.stringify({
        event: 'message', content, skill_id: skillId ?? null, allowed_tools: allowedTools,
        ...(localHistoryPayload ? { local_history: localHistoryPayload } : {}),
        ...((() => {
          const { customLLMConfig } = useAppStore.getState()
          if (!customLLMConfig.enabled || !customLLMConfig.model || !customLLMConfig.api_key) return {}
          return {
            custom_llm_config: {
              provider: customLLMConfig.provider,
              model: customLLMConfig.model,
              api_key: customLLMConfig.api_key,
              base_url: customLLMConfig.base_url || null,
              temperature: customLLMConfig.temperature,
              context_limit: customLLMConfig.context_limit,
            },
          }
        })()),
      }))
    },
    [sessionId, setCatState, appendMessage, connect]
  )

  return { sendMessage }
}

async function _executeAndReply(
  ws: WebSocket,
  sessionId: string,
  tc: ToolCall,
  callId: string,
  toolMsgId?: string,
) {
  useAppStore.getState().updateToolCallStatus(sessionId, callId, { status: 'executing' })
  const result = await executeLocalTool(tc.tool, tc.args)
  const finalStatus = result.error ? 'error' : 'done'
  const resultStr = JSON.stringify(result)
  useAppStore.getState().updateToolCallStatus(sessionId, callId, {
    status: finalStatus,
    result: resultStr,
  })
  // 更新本地 SQLite 中的工具调用状态
  if (toolMsgId) {
    const dbBridge = window.nekoBridge?.db
    if (dbBridge) {
      const updatedTc = { ...tc, status: finalStatus, result: resultStr }
      dbBridge.updateMessageToolCalls?.(toolMsgId, JSON.stringify([updatedTc])).catch(() => {})
    }
  }
  ws.send(JSON.stringify({ event: 'tool_result', call_id: callId, result }))
}

/** Called by sandbox confirm dialog */
export async function confirmTool(callId: string, tool: string, args: Record<string, unknown>) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return
  const sessionId = useAppStore.getState().activeSessionId!
  const tc = { callId, tool, args, riskLevel: 'HIGH' as const, status: 'confirmed' as const }
  await _executeAndReply(_ws, sessionId, tc, callId)
}

export function denyTool(callId: string) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return
  _ws.send(JSON.stringify({ event: 'tool_result', call_id: callId, error: 'User denied' }))
}

/** Get the ephemeral server session ID mapped to a local session (if any). */
export function getEphemeralServerId(localId: string): string | undefined {
  return _ephemeralServerMap[localId]
}

/** Remove the ephemeral mapping for a local session. */
export function clearEphemeralMapping(localId: string): void {
  delete _ephemeralServerMap[localId]
}

/** Return all ephemeral server session IDs (used to filter them from session lists). */
export function getEphemeralServerIds(): Set<string> {
  return new Set(Object.values(_ephemeralServerMap))
}
