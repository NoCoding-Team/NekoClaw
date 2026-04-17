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
      // 发送带入的待发消息（local- 会话 第一条消息）
      if (pendingMessage.current) {
        const { content, skillId, allowedTools, ephemeral: eph, localHistory: lh } = pendingMessage.current
        const localHistory = lh ?? pendingLocalHistory.current
        pendingMessage.current = null
        pendingLocalHistory.current = null
        const sid = useAppStore.getState().activeSessionId!
        // 若 handleSend 已乐观写入该条消息（新对话场景），跳过重复追加
        const existingMsgs = useAppStore.getState().messagesBySession[sid] ?? []
        if (!existingMsgs.some(m => m.role === 'user' && m.content === content)) {
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
      if (wsRef.current !== ws) return
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
      } else if (type === 'llm_thinking') {
        // 仅设状态，不预先创建 streaming 气泡——防止工具卡插入后 token 丢失
        setCatState('thinking')
      } else if (type === 'llm_token') {
        if (!streamingMsgId.current) {
          // 首个 token 到达时创建气泡（工具卡已在其前，此时 append 就是最后一条）
          const id = uuidv4()
          streamingMsgId.current = id
          appendMessage(sessionId!, { id, role: 'assistant', content: '', streaming: true })
        }
        updateLastAssistantToken(sessionId!, evt.token as string)
      } else if (type === 'llm_done') {
        streamingMsgId.current = null
        // 本轮 LLM 输出结束，立即重置为 idle，避免残留 thinking 状态导致闪现加载气泡
        setCatState('idle')
        // 清除幽灵空 streaming 消息，将最后一条标记为完成
        const sid = sessionId!
        const msgs = useAppStore.getState().messagesBySession[sid] ?? []
        const cleanedMsgs = msgs.filter(m => !(m.role === 'assistant' && m.streaming && !m.content))
        const last = cleanedMsgs[cleanedMsgs.length - 1]
        if (last?.streaming) {
          const finalContent = last.content
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
          const { syncEnabled, serverUrl: svSync, token: tkSync } = useAppStore.getState()
          if (syncEnabled && tkSync && dbBridge) {
            ;(async () => {
              try {
                const unsynced = await dbBridge.getMessages(sessionId)
                const batch = unsynced
                  .filter((m) => m.synced === 0 && (m.role === 'user' || m.role === 'assistant'))
                  .map((m) => ({ role: m.role, content: m.content }))
                if (batch.length > 0) {
                  await apiFetch(`${svSync}/api/sessions/${sessionId}/messages/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(batch),
                  })
                  await dbBridge.markSynced(sessionId)
                }
              } catch {
                // silently retain synced=0 for retry next time
              }
            })()
          }
          // 标题两段式 Stage 1：首轮消息完成后，立即用用户输入截断作标题
          const allMsgs = useAppStore.getState().messagesBySession[sid] ?? []
          const userMsgCount = allMsgs.filter(m => m.role === 'user').length
          if (userMsgCount === 1) {
            const firstUserMsg = allMsgs.find(m => m.role === 'user')
            if (firstUserMsg) {
              const stage1Title = firstUserMsg.content.slice(0, 15) + (firstUserMsg.content.length > 15 ? '…' : '')
              useAppStore.getState().updateSessionTitle(sid, stage1Title)
              if (dbBridge) {
                dbBridge.upsertSession(sid, stage1Title, Date.now()).catch(() => {})
              }
              // Stage 2 由后端 finalize 节点通过 title_update 事件推送覆盖
            }
          }
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
        appendMessage(sessionId!, { id: uuidv4(), role: 'tool', content: '', toolCalls: [tc] })
      } else if (type === 'server_tool_done') {
        updateToolCallStatus(sessionId!, evt.call_id as string, {
          status: 'done',
          result: (evt.result as string) || '',
        })
      } else if (type === 'tool_call') {
        // Append tool call card then execute
        const callId = evt.call_id as string
        const toolName = evt.tool as string
        const args = evt.args as Record<string, unknown>
        const riskLevel = (evt.risk_level as string) || 'LOW'
        const reason = evt.reason as string | undefined

        const tc: ToolCall = {
          callId,
          tool: toolName,
          args,
          riskLevel: riskLevel as any,
          reason,
          status: 'pending',
        }

        appendMessage(sessionId, {
          id: uuidv4(),
          role: 'tool',
          content: '',
          toolCalls: [tc],
        })

        const { securityConfig } = useAppStore.getState()

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

        // ── Auto-execute decision ────────────────────────────────────
        const inToolWhitelist = securityConfig.toolWhitelist.includes(toolName)
        // Sandbox threshold: levels that auto-run without confirmation
        const THRESHOLD_AUTO: Record<string, string[]> = {
          'off':    ['LOW', 'MEDIUM', 'HIGH'],
          'HIGH':   ['LOW', 'MEDIUM'],
          'MEDIUM': ['LOW'],
          'LOW':    [],
        }
        const autoByThreshold = (THRESHOLD_AUTO[securityConfig.sandboxThreshold ?? 'MEDIUM'] ?? ['LOW']).includes(riskLevel)

        // shell_exec: also check commandWhitelist if configured
        let blockedByCommandWL = false
        if (toolName === 'shell_exec' && securityConfig.commandWhitelist.length > 0) {
          const cmd = String(args.command ?? '')
          const cmdBase = cmd.trim().split(/\s+/)[0]
          blockedByCommandWL = !securityConfig.commandWhitelist.some(
            (w) => cmdBase === w || cmd.trimStart().startsWith(w + ' ')
          )
        }

        const autoRun = !blockedByCommandWL && (securityConfig.fullAccessMode || inToolWhitelist || autoByThreshold)

        if (autoRun) {
          if (inToolWhitelist) {
            useAppStore.getState().incrementToolCallCount(toolName)
          }
          await _executeAndReply(ws, sessionId, tc, callId)
        }
        // For MEDIUM/HIGH (not whitelisted, not full-access): SandboxConfirmDialog handles it
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

      wsRef.current = null
      _ws = null
      wsUrlRef.current = null
      setWsStatus('disconnected')
      streamingMsgId.current = null
      setCatState('idle')
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

  // (Re)connect when deps change; do NOT close the socket in cleanup —
  // connect() already handles close-old-if-switching internally.
  useEffect(() => {
    connect()
    return () => {
      // Only cancel pending reconnect timer so a stale timer doesn't fire
      // for a previous session.  The socket itself stays alive.
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [connect])

  // Close the socket only when the component truly unmounts
  // (e.g. user navigates away from chat panel).
  useEffect(() => {
    return () => {
      intentionalClose.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pingTimer.current) clearInterval(pingTimer.current)
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

          // Optimistic UI — skip if handleSend already appended this user message
          const existingMsgs = useAppStore.getState().messagesBySession[currentSessionId] ?? []
          const alreadyAppended = existingMsgs.some(m => m.role === 'user' && m.content === content)
          const userMsgId = uuidv4()
          if (!alreadyAppended) {
            appendMessage(currentSessionId, { id: userMsgId, role: 'user', content })
          }
          resetRound(currentSessionId)

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
            if (!res.ok) return
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
            wsRef.current.send(buildPayload())
          } else {
            // First message: queue pending and (re)connect
            pendingMessage.current = { content, skillId, allowedTools, ephemeral: true, localHistory }
            if (wsRef.current) { intentionalClose.current = true; wsRef.current.close() }
            intentionalClose.current = false
            connect()
          }
        } catch { /* ignore */ }
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
          if (!res.ok) return
          const s = await res.json()
          useAppStore.getState().replaceSession(currentSessionId, { id: s.id, title: s.title })
          const { securityConfig: sc } = useAppStore.getState()
          const allowedTools = sc.toolWhitelist
          setCatState('thinking')
          pendingMessage.current = { content, skillId, allowedTools }
          pendingLocalHistory.current = localHistory
          resetRound(currentSessionId)
        } catch { /* ignore */ }
        return
      }

      // ── Branch C: regular server session → direct send ────────────
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      setCatState('thinking')
      const userMsgId = uuidv4()
      appendMessage(sessionId!, { id: userMsgId, role: 'user', content })
      resetRound(sessionId!)
      const { securityConfig } = useAppStore.getState()
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
  callId: string
) {
  useAppStore.getState().updateToolCallStatus(sessionId, callId, { status: 'executing' })
  const result = await executeLocalTool(tc.tool, tc.args)
  useAppStore.getState().updateToolCallStatus(sessionId, callId, {
    status: result.error ? 'error' : 'done',
    result: JSON.stringify(result),
  })
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
