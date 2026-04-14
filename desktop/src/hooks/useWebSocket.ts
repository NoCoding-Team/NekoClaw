/**
 * WebSocket client with auto-reconnect (exponential backoff).
 * Handles all server events and dispatches them into Zustand store.
 */
import { useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore, ToolCall } from '../store/app'
import { executeLocalTool } from './localTools'

const MAX_BACKOFF = 30_000

// Module-level ref kept in sync by the hook, used by confirmTool/denyTool
let _ws: WebSocket | null = null

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
  /** 待发的第一条消息（local- 会话 materialized 后在 onopen 中发送） */
  const pendingMessage = useRef<{ content: string; skillId?: string | null; allowedTools?: string[] | null } | null>(null)

  const connect = useCallback(() => {
    if (!token || !sessionId) return
    // local-* sessions are client-side only and never registered on the server
    if (sessionId.startsWith('local-')) return
    const wsUrl = serverUrl.replace(/^http/, 'ws') + `/api/ws/${sessionId}?token=${token}`
    setWsStatus('connecting')

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    _ws = ws

    ws.onopen = () => {
      backoffRef.current = 1_000
      setWsStatus('connected')
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'ping' }))
      }, 30_000)
      // 发送带入的待发消息（local- 会话 第一条消息）
      if (pendingMessage.current) {
        const { content, skillId, allowedTools } = pendingMessage.current
        pendingMessage.current = null
        const sid = useAppStore.getState().activeSessionId!
        appendMessage(sid, { id: uuidv4(), role: 'user', content })
        ws.send(JSON.stringify({ event: 'message', content, skill_id: skillId ?? null, allowed_tools: allowedTools ?? null }))
      }
    }

    ws.onmessage = async (ev) => {
      let evt: Record<string, unknown>
      try {
        evt = JSON.parse(ev.data)
      } catch {
        return
      }
      const type = evt.event as string

      if (type === 'cat_state') {
        setCatState(evt.state as any)
      } else if (type === 'llm_thinking') {
        setCatState('thinking')
      } else if (type === 'llm_token') {
        if (!streamingMsgId.current) {
          const id = uuidv4()
          streamingMsgId.current = id
          appendMessage(sessionId, { id, role: 'assistant', content: '', streaming: true })
        }
        updateLastAssistantToken(sessionId, evt.token as string)
      } else if (type === 'llm_done') {
        streamingMsgId.current = null
        // Mark last assistant message as done
        const msgs = useAppStore.getState().messagesBySession[sessionId] ?? []
        const last = msgs[msgs.length - 1]
        if (last?.streaming) {
          useAppStore.getState().setMessages(sessionId, [
            ...msgs.slice(0, -1),
            { ...last, streaming: false },
          ])
          // 两段式标题：仅在第一轮对话时触发
          const allMsgs = useAppStore.getState().messagesBySession[sessionId] ?? []
          const isFirstRound = allMsgs.filter((m) => m.role === 'assistant').length === 1
          if (isFirstRound) {
            const firstUser = allMsgs.find((m) => m.role === 'user')
            const { serverUrl: sv, token: tk, updateSessionTitle } = useAppStore.getState()
            if (tk && firstUser) {
              // Stage 1: 立即截取前15字
              const shortTitle = firstUser.content.slice(0, 15) + (firstUser.content.length > 15 ? '…' : '')
              fetch(`${sv}/api/sessions/${sessionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
                body: JSON.stringify({ title: shortTitle }),
              }).catch(() => {})
              updateSessionTitle(sessionId, shortTitle)
              // Stage 2: 通知后端用 LLM 生成标题（如果后端支持可扩展，目前不实现以避免重复调用）
              // WebSocket 模式下后端已有上下文，可以后续从后端推送 title_update 事件来实现
            }
          }
        }
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
        const autoRun = securityConfig.fullAccessMode || inToolWhitelist || riskLevel === 'LOW'

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
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      _ws = null
      setWsStatus('disconnected')
      if (pingTimer.current) clearInterval(pingTimer.current)
      // Skip reconnect if this was an intentional close (e.g. session changed)
      if (intentionalClose.current) return
      // Exponential backoff reconnect
      reconnectTimer.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
        connect()
      }, backoffRef.current)
    }

    ws.onerror = () => ws.close()
  }, [token, sessionId, serverUrl]) // eslint-disable-line

  useEffect(() => {
    intentionalClose.current = false
    connect()
    return () => {
      intentionalClose.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pingTimer.current) clearInterval(pingTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const sendMessage = useCallback(
    async (content: string, skillId?: string | null) => {
      // 如果是 local- 会话，先 materialize，待 WS 连接后再发送
      const currentSessionId = useAppStore.getState().activeSessionId
      if (currentSessionId?.startsWith('local-')) {
        const { serverUrl: sv, token: tk } = useAppStore.getState()
        if (!tk) return
        try {
          const res = await fetch(`${sv}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
            body: JSON.stringify({ title: '新对话' }),
          })
          if (!res.ok) return
          const s = await res.json()
          useAppStore.getState().replaceSession(currentSessionId, { id: s.id, title: s.title })
          // pendingMessage 会在 onopen 中被发送（connect 会因 activeSessionId 变化而重新触发）
          const { securityConfig: sc } = useAppStore.getState()
          const allowedTools = sc.toolWhitelist   // 空数组 = 无工具，原样传递
          setCatState('thinking')
          pendingMessage.current = { content, skillId, allowedTools }
          resetRound(currentSessionId)
        } catch {}
        return
      }

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      setCatState('thinking')
      appendMessage(sessionId!, {
        id: uuidv4(),
        role: 'user',
        content,
      })
      resetRound(sessionId!)
      const { securityConfig } = useAppStore.getState()
      const allowedTools = securityConfig.toolWhitelist   // 空数组 = 无工具，原样传递
      wsRef.current.send(JSON.stringify({ event: 'message', content, skill_id: skillId ?? null, allowed_tools: allowedTools }))
    },
    [sessionId, setCatState, appendMessage]
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
