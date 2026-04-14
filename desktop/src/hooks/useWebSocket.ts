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

        // If LOW risk, auto-execute; otherwise wait for user confirmation via sandbox UI
        if (riskLevel === 'LOW') {
          await _executeAndReply(ws, sessionId, tc, callId)
        }
        // For MEDIUM/HIGH: SandboxConfirmDialog will call confirmTool / denyTool
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
    (content: string, skillId?: string | null) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      setCatState('thinking')
      appendMessage(sessionId!, {
        id: uuidv4(),
        role: 'user',
        content,
      })
      wsRef.current.send(JSON.stringify({ event: 'message', content, skill_id: skillId ?? null }))
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
