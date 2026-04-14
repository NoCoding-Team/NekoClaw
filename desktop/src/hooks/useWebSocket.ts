/**
 * WebSocket client with auto-reconnect (exponential backoff).
 * Handles all server events and dispatches them into Zustand store.
 */
import { useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore, ToolCall } from '../store/app'
import { executeLocalTool } from './localTools'

const MAX_BACKOFF = 30_000

let wsRef: WebSocket | null = null
let backoff = 1_000

export function useWebSocket(sessionId: string | null) {
  const {
    token,
    serverUrl,
    setCatState,
    setWsStatus,
    activeSessionId,
    appendMessage,
    updateLastAssistantToken,
    updateToolCallStatus,
  } = useAppStore()

  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamingMsgId = useRef<string | null>(null)

  const connect = useCallback(() => {
    if (!token || !sessionId) return
    // local-* sessions are client-side only and never registered on the server
    if (sessionId.startsWith('local-')) return
    const wsUrl = serverUrl.replace(/^http/, 'ws') + `/ws/${sessionId}?token=${token}`
    setWsStatus('connecting')

    const ws = new WebSocket(wsUrl)
    wsRef = ws

    ws.onopen = () => {
      backoff = 1_000
      setWsStatus('connected')
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, 30_000)
    }

    ws.onmessage = async (ev) => {
      let evt: { type: string; data?: Record<string, unknown> }
      try {
        evt = JSON.parse(ev.data)
      } catch {
        return
      }
      const { type, data = {} } = evt

      if (type === 'cat_state') {
        setCatState(data.state as any)
      } else if (type === 'llm_thinking') {
        setCatState('thinking')
      } else if (type === 'llm_token') {
        if (!streamingMsgId.current) {
          const id = uuidv4()
          streamingMsgId.current = id
          appendMessage(sessionId, { id, role: 'assistant', content: '', streaming: true })
        }
        updateLastAssistantToken(sessionId, data.token as string)
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
        const callId = data.call_id as string
        const toolName = data.tool as string
        const args = data.args as Record<string, unknown>
        const riskLevel = (data.risk_level as string) || 'LOW'
        const reason = data.reason as string | undefined

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
        updateToolCallStatus(sessionId, data.call_id as string, { status: 'denied' })
      } else if (type === 'tool_error') {
        updateToolCallStatus(sessionId, data.call_id as string, {
          status: 'error',
          result: data.error as string,
        })
      } else if (type === 'pong') {
        // heartbeat ok
      }
    }

    ws.onclose = () => {
      wsRef = null
      setWsStatus('disconnected')
      if (pingTimer.current) clearInterval(pingTimer.current)
      // Exponential backoff reconnect
      reconnectTimer.current = setTimeout(() => {
        backoff = Math.min(backoff * 2, MAX_BACKOFF)
        connect()
      }, backoff)
    }

    ws.onerror = () => ws.close()
  }, [token, sessionId, serverUrl]) // eslint-disable-line

  useEffect(() => {
    connect()
    return () => {
      wsRef?.close()
      if (pingTimer.current) clearInterval(pingTimer.current)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [connect])

  const sendMessage = useCallback(
    (content: string, skillId?: string | null) => {
      if (!wsRef || wsRef.readyState !== WebSocket.OPEN) return
      setCatState('thinking')
      appendMessage(sessionId!, {
        id: uuidv4(),
        role: 'user',
        content,
      })
      wsRef.send(JSON.stringify({ type: 'message', data: { content, skill_id: skillId } }))
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
  ws.send(JSON.stringify({
    type: 'tool_result',
    data: { call_id: callId, result },
  }))
}

/** Called by sandbox confirm dialog */
export async function confirmTool(callId: string, tool: string, args: Record<string, unknown>) {
  if (!wsRef || wsRef.readyState !== WebSocket.OPEN) return
  const sessionId = useAppStore.getState().activeSessionId!
  const tc = { callId, tool, args, riskLevel: 'HIGH' as const, status: 'confirmed' as const }
  await _executeAndReply(wsRef, sessionId, tc, callId)
}

export function denyTool(callId: string) {
  if (!wsRef || wsRef.readyState !== WebSocket.OPEN) return
  wsRef.send(JSON.stringify({ type: 'tool_result', data: { call_id: callId, error: 'User denied' } }))
}
