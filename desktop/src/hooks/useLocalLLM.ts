/**
 * Local LLM hook — streams responses directly from the configured API endpoint
 * without going through the NekoClaw backend server.
 *
 * Supports:
 *  - OpenAI-compatible APIs  (POST /chat/completions, SSE delta format)
 *  - Anthropic native API    (POST /v1/messages, SSE delta format)
 *  - Custom / Ollama          (OpenAI-compatible)
 */
import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from '../store/app'

async function decryptKey(b64: string): Promise<string> {
  if (window.nekoBridge?.storage) {
    const result = await window.nekoBridge.storage.decrypt(b64)
    return result.decrypted ?? atob(b64)
  }
  return atob(b64)
}

async function encryptKey(plaintext: string): Promise<string> {
  if (window.nekoBridge?.storage) {
    const result = await window.nekoBridge.storage.encrypt(plaintext)
    return result.encrypted ?? btoa(plaintext)
  }
  return btoa(plaintext)
}

export { encryptKey }

// ── OpenAI-compatible streaming ────────────────────────────────────────────
async function streamOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
  messages: { role: string; content: string }[],
  onToken: (t: string) => void,
  signal: AbortSignal
) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature,
    }),
    signal,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API 错误 ${res.status}: ${body}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const evt = JSON.parse(payload)
        const delta = evt.choices?.[0]?.delta?.content
        if (delta) onToken(delta)
      } catch {
        // ignore parse errors on individual lines
      }
    }
  }
}

// ── Anthropic native streaming ─────────────────────────────────────────────
async function streamAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
  messages: { role: string; content: string }[],
  onToken: (t: string) => void,
  signal: AbortSignal
) {
  const url = baseUrl.replace(/\/$/, '') + '/v1/messages'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature,
    }),
    signal,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API 错误 ${res.status}: ${body}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      try {
        const evt = JSON.parse(payload)
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          onToken(evt.delta.text ?? '')
        }
      } catch {
        // ignore
      }
    }
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────
async function persistMessage(
  serverUrl: string,
  token: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
) {
  try {
    await fetch(`${serverUrl}/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role, content }),
    })
  } catch {
    // best-effort — don't block UI if server is unreachable
  }
}

export function useLocalLLM(sessionId: string | null) {
  const {
    localLLMConfig,
    appendMessage,
    updateLastAssistantToken,
    setMessages,
    setCatState,
  } = useAppStore()

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || !localLLMConfig) return

      setCatState('thinking')

      // Append user message first
      appendMessage(sessionId, { id: uuidv4(), role: 'user', content })

      // Persist user message to backend (best-effort)
      const { serverUrl, token } = useAppStore.getState()
      if (token && !sessionId.startsWith('local-')) {
        persistMessage(serverUrl, token, sessionId, 'user', content)
      }

      // Read history from store *after* appending, to avoid stale closure
      const allMsgs = useAppStore.getState().messagesBySession[sessionId] ?? []
      const history = allMsgs
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }))

      // Decrypt API key
      let apiKey = ''
      try {
        apiKey = await decryptKey(localLLMConfig.apiKeyB64)
      } catch {
        const errId = uuidv4()
        appendMessage(sessionId, {
          id: errId,
          role: 'assistant',
          content: '❌ API Key 解密失败，请重新在设置中保存配置。',
        })
        setCatState('error')
        return
      }

      // Create streaming assistant message placeholder
      const msgId = uuidv4()
      appendMessage(sessionId, { id: msgId, role: 'assistant', content: '', streaming: true })

      const controller = new AbortController()

      try {
        const isAnthropic =
          localLLMConfig.provider === 'anthropic' &&
          localLLMConfig.baseUrl.includes('anthropic.com')

        const streamFn = isAnthropic ? streamAnthropic : streamOpenAI

        await streamFn(
          localLLMConfig.baseUrl,
          apiKey,
          localLLMConfig.model,
          localLLMConfig.maxTokens,
          localLLMConfig.temperature,
          history,
          (token) => updateLastAssistantToken(sessionId, token),
          controller.signal
        )

        // Mark stream as done
        const msgs = useAppStore.getState().messagesBySession[sessionId] ?? []
        const last = msgs[msgs.length - 1]
        if (last?.streaming) {
          const finalMsg = { ...last, streaming: false }
          setMessages(sessionId, [...msgs.slice(0, -1), finalMsg])
          // Persist assistant message to backend (best-effort)
          const { serverUrl, token } = useAppStore.getState()
          if (token && !sessionId.startsWith('local-')) {
            persistMessage(serverUrl, token, sessionId, 'assistant', finalMsg.content)
          }
        }
        setCatState('idle')
      } catch (e: unknown) {
        const msgs = useAppStore.getState().messagesBySession[sessionId] ?? []
        const last = msgs[msgs.length - 1]
        if (last?.streaming) {
          let errText = e instanceof Error ? e.message : String(e)
          if (errText === 'Failed to fetch') {
            const url = localLLMConfig.baseUrl || '（未配置）'
            errText = `无法连接到 ${url}\n请检查：① 服务是否运行 ② Base URL 是否正确 ③ 网络是否通畅`
          }
          setMessages(sessionId, [
            ...msgs.slice(0, -1),
            { ...last, streaming: false, content: last.content || `❌ ${errText}` },
          ])
        }
        setCatState('error')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, localLLMConfig]
  )

  return { sendMessage }
}
