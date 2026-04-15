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
import type { LocalLLMConfig, ToolCall } from '../store/app'
import { executeLocalTool } from './localTools'
import { getLocalToolDefinitions } from './toolDefinitions'

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

// ── StreamResult types ────────────────────────────────────────────────────
export interface ToolCallDelta {
  id: string
  name: string
  arguments: string
}

export interface StreamResult {
  content: string
  toolCalls: ToolCallDelta[] | null
  finishReason: string
}

const MAX_TOOL_ROUNDS = 10

// Per-session loop detection state (mirrors useWebSocket)
const _recentTools: Record<string, string[]> = {}
function detectLoop(sessionId: string, toolName: string, sensitivity: 'strict' | 'default' | 'loose'): boolean {
  const window = { strict: 3, default: 5, loose: 8 }[sensitivity]
  const recent = _recentTools[sessionId] ?? []
  if (recent.length < window) return false
  const last = recent.slice(-window)
  return last.every((t) => t === toolName)
}

// ── OpenAI-compatible streaming ────────────────────────────────────────────
async function streamOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
  messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[],
  onToken: (t: string) => void,
  signal: AbortSignal,
  tools?: unknown[],
): Promise<StreamResult> {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    max_tokens: maxTokens,
    temperature,
  }
  if (tools && tools.length > 0) body.tools = tools
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API 错误 ${res.status}: ${text}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let fullContent = ''
  let finishReason = 'stop'
  const toolCallAcc = new Map<number, ToolCallDelta>()

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
      if (payload === '[DONE]') {
        return {
          content: fullContent,
          toolCalls: toolCallAcc.size > 0 ? [...toolCallAcc.values()] : null,
          finishReason,
        }
      }
      try {
        const evt = JSON.parse(payload)
        const choice = evt.choices?.[0]
        if (!choice) continue

        // Text content
        const delta = choice.delta?.content
        if (delta) {
          fullContent += delta
          onToken(delta)
        }

        // Tool calls (incremental)
        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx: number = tc.index ?? 0
            if (!toolCallAcc.has(idx)) {
              toolCallAcc.set(idx, { id: '', name: '', arguments: '' })
            }
            const acc = toolCallAcc.get(idx)!
            if (tc.id) acc.id = tc.id
            if (tc.function?.name) acc.name = tc.function.name
            if (tc.function?.arguments) acc.arguments += tc.function.arguments
          }
        }

        // Finish reason
        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }
      } catch {
        // ignore parse errors on individual lines
      }
    }
  }
  return {
    content: fullContent,
    toolCalls: toolCallAcc.size > 0 ? [...toolCallAcc.values()] : null,
    finishReason,
  }
}

// ── Anthropic native streaming ─────────────────────────────────────────────
async function streamAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
  messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[],
  onToken: (t: string) => void,
  signal: AbortSignal,
  tools?: unknown[],
): Promise<StreamResult> {
  const url = baseUrl.replace(/\/$/, '') + '/v1/messages'
  // Anthropic不允许 system role 在 messages 里，单独提取
  const systemParts = messages.filter(m => m.role === 'system').map(m => m.content)
  const chatMsgs = messages.filter(m => m.role !== 'system')
  const body: Record<string, unknown> = {
    model,
    ...(systemParts.length ? { system: systemParts.join('\n') } : {}),
    messages: chatMsgs,
    stream: true,
    max_tokens: maxTokens,
    temperature,
  }
  if (tools && tools.length > 0) {
    // Convert OpenAI function calling format to Anthropic tool format
    body.tools = (tools as Array<{ type: string; function: { name: string; description: string; parameters: unknown } }>).map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }))
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API 错误 ${res.status}: ${text}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let fullContent = ''
  let finishReason = 'stop'
  // Accumulate tool_use blocks by content_block index
  const toolBlocks = new Map<number, ToolCallDelta>()

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
        // Text delta
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          const text = evt.delta.text ?? ''
          fullContent += text
          onToken(text)
        }
        // Tool use block start
        if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
          const idx: number = evt.index
          toolBlocks.set(idx, {
            id: evt.content_block.id ?? '',
            name: evt.content_block.name ?? '',
            arguments: '',
          })
        }
        // Tool use input delta
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
          const idx: number = evt.index
          const block = toolBlocks.get(idx)
          if (block) {
            block.arguments += evt.delta.partial_json ?? ''
          }
        }
        // Message delta (stop reason)
        if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
          finishReason = evt.delta.stop_reason === 'tool_use' ? 'tool_calls' : evt.delta.stop_reason
        }
      } catch {
        // ignore
      }
    }
  }
  return {
    content: fullContent,
    toolCalls: toolBlocks.size > 0 ? [...toolBlocks.values()] : null,
    finishReason,
  }
}

// ── Memory extraction ─────────────────────────────────────────────────────
/**
 * Fire-and-forget: ask the local LLM to extract memorable facts from the
 * recent conversation and save them to the backend memory store.
 * Runs after every assistant response when a backend token is available.
 */
async function extractMemoriesAsync(
  config: LocalLLMConfig,
  apiKey: string,
  messages: { role: string; content: string }[],
  serverUrl: string,
  authToken: string,
) {
  const turns = messages.filter(m => m.role === 'user' || m.role === 'assistant')
  if (turns.length < 2) return
  // Keep last 4 messages (2 turns) to minimise cost
  const recentTurns = turns.slice(-4)

  const extractPrompt =
    '你是记忆提取助手。分析以下对话，提取值得**长期记忆**的用户信息（偏好、个人事实、明确指令、个人经历）。' +
    '忽略闲聊和临时性问题，宁缺毋滥。\n' +
    '以 JSON 数组返回，每项含 category 和 content。' +
    'category 取值：preference / fact / instruction / history / other。' +
    '无值得记忆的内容返回 []。只输出 JSON，不加任何解释。'

  try {
    const baseUrl = config.baseUrl.replace(/\/$/, '')
    const isAnthropic = config.provider === 'anthropic' && baseUrl.includes('anthropic.com')
    let rawContent = ''

    if (isAnthropic) {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: config.model, system: extractPrompt, messages: recentTurns, max_tokens: 500 }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return
      const data = await res.json()
      rawContent = data.content?.[0]?.text ?? ''
    } else {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'system', content: extractPrompt }, ...recentTurns],
          max_tokens: 500,
          temperature: 0.1,
          stream: false,
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return
      const data = await res.json()
      rawContent = data.choices?.[0]?.message?.content ?? ''
    }

    const jsonMatch = rawContent.trim().match(/\[[\s\S]*\]/)
    if (!jsonMatch) return
    const items: { category: string; content: string }[] = JSON.parse(jsonMatch[0])
    const VALID_CATS = new Set(['preference', 'fact', 'instruction', 'history', 'other'])
    await Promise.all(
      items
        .filter(item => item.content?.trim())
        .map(item =>
          fetch(`${serverUrl}/api/memory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({
              category: VALID_CATS.has(item.category) ? item.category : 'other',
              content: item.content.trim().slice(0, 1000),
            }),
          }).catch(() => {}),
        ),
    )
  } catch {
    // best-effort — never block UI
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

/**
 * 两段式标题更新：
 * stage 1 — 立刻用用户消息前15字更新标题（零延迟反馈）
 * stage 2 — 拿到完整 user+assistant 对话后，用 LLM 生成语义标题覆盖
 */
async function autoUpdateTitle(
  sessionId: string,
  userContent: string,
  assistantContent: string,
  config: import('../store/app').LocalLLMConfig,
  serverUrl: string,
  token: string,
) {
  const isLocal = sessionId.startsWith('local-')
  if (!token && !isLocal) return

  // Stage 1: 立即截取前15字
  const shortTitle = userContent.slice(0, 15) + (userContent.length > 15 ? '…' : '')
  if (!isLocal) await patchSessionTitle(serverUrl, token, sessionId, shortTitle)
  useAppStore.getState().updateSessionTitle(sessionId, shortTitle)
  window.nekoBridge?.db?.upsertSession(sessionId, shortTitle, Date.now()).catch(() => {})

  // Stage 2: 用 LLM 生成语义标题（不阻塞主流程，在后台跑）
  try {
    let apiKey = ''
    try { apiKey = await decryptKey(config.apiKeyB64) } catch { return }

    let generatedTitle = ''
    const isAnthropic =
      config.provider === 'anthropic' && config.baseUrl.includes('anthropic.com')
    const streamFn = isAnthropic ? streamAnthropic : streamOpenAI
    const titlePrompt = [
      { role: 'user', content: `根据以下对话，用一句话（10字以内，不加引号、不加标点结尾）总结主题。\n用户：${userContent}\n助手：${assistantContent}` },
    ]
    await streamFn(
      config.baseUrl, apiKey, config.model,
      32, 0.3, titlePrompt,
      (t) => { generatedTitle += t },
      new AbortController().signal,
    )
    const finalTitle = generatedTitle.trim().slice(0, 30) || shortTitle
    if (!isLocal) await patchSessionTitle(serverUrl, token, sessionId, finalTitle)
    useAppStore.getState().updateSessionTitle(sessionId, finalTitle)
    window.nekoBridge?.db?.upsertSession(sessionId, finalTitle, Date.now()).catch(() => {})
  } catch {
    // Stage 2 失败不影响任何功能，Stage 1 的标题已生效
  }
}

async function patchSessionTitle(serverUrl: string, token: string, sessionId: string, title: string) {
  try {
    await fetch(`${serverUrl}/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title }),
    })
  } catch {
    // best-effort
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

      // ── Materialize local session on first message ──────────────────────
      let sid = sessionId
      if (sessionId.startsWith('local-')) {
        const { serverUrl: sv, token: tk, syncEnabled } = useAppStore.getState()
        if (tk && syncEnabled) {
          try {
            const res = await fetch(`${sv}/api/sessions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
              body: JSON.stringify({ title: '新对话' }),
            })
            if (res.ok) {
              const s = await res.json()
              useAppStore.getState().replaceSession(sessionId, { id: s.id, title: s.title })
              sid = s.id
            }
          } catch { /* keep local id */ }
        }
        // If still local (not materialized), ensure session row exists in SQLite
        if (sid.startsWith('local-')) {
          const dbBridge = window.nekoBridge?.db
          if (dbBridge) {
            const sTitle = useAppStore.getState().sessions.find((s) => s.id === sid)?.title ?? '新对话'
            dbBridge.upsertSession(sid, sTitle, Date.now()).catch(() => {})
          }
        }
      }

      // Append user message first
      const userMsgId = uuidv4()
      appendMessage(sid, { id: userMsgId, role: 'user', content })

      // Persist user message to backend or local SQLite
      const { serverUrl, token } = useAppStore.getState()
      if (token && !sid.startsWith('local-')) {
        persistMessage(serverUrl, token, sid, 'user', content)
      } else if (sid.startsWith('local-')) {
        const dbBridge = window.nekoBridge?.db
        if (dbBridge) {
          dbBridge.insertMessage({ id: userMsgId, sessionId: sid, role: 'user', content, toolCalls: null, tokenCount: content.length, createdAt: Date.now() }).catch(() => {})
        }
      }

      // Read history from store *after* appending, to avoid stale closure
      const allMsgs = useAppStore.getState().messagesBySession[sid] ?? []
      // Prepend system prompt from personalization config
      const systemPrompt = useAppStore.getState().personalizationConfig?.systemPrompt
      const history = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...allMsgs
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content })),
      ]

      // Decrypt API key
      let apiKey = ''
      try {
        apiKey = await decryptKey(localLLMConfig.apiKeyB64)
      } catch {
        const errId = uuidv4()
        appendMessage(sid, {
          id: errId,
          role: 'assistant',
          content: '❌ API Key 解密失败，请重新在设置中保存配置。',
        })
        setCatState('error')
        return
      }

      // 模式 B：服务端注入记忆/Skill Prompt（best-effort，失败时直接用本地 history）
      let enhancedHistory = history
      try {
        const { serverUrl: sv, token: tk } = useAppStore.getState()
        if (tk) {
          const res = await fetch(`${sv}/api/llm/enhance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
            body: JSON.stringify({
              messages: history,
              client_system_prompt: useAppStore.getState().personalizationConfig?.systemPrompt || null,
            }),
            signal: AbortSignal.timeout(5000),
          })
          if (res.ok) enhancedHistory = (await res.json()).messages
        }
      } catch { /* proceed without server enhancement */ }

      // Create streaming assistant message placeholder
      const msgId = uuidv4()
      appendMessage(sid, { id: msgId, role: 'assistant', content: '', streaming: true })

      const controller = new AbortController()

      try {
        const isAnthropic =
          localLLMConfig.provider === 'anthropic' &&
          localLLMConfig.baseUrl.includes('anthropic.com')

        const streamFn = isAnthropic ? streamAnthropic : streamOpenAI

        // Build tool definitions
        const { securityConfig } = useAppStore.getState()
        const toolDefs = getLocalToolDefinitions(
          securityConfig.toolWhitelist?.length ? securityConfig.toolWhitelist : null,
        )

        // ── Agentic Loop ───────────────────────────────────────────────────
        // Messages array for the LLM (mutable, accumulates tool results)
        const llmMessages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[] =
          enhancedHistory.map((m) => ({ ...m }))

        let rounds = 0
        let roundToolCount = 0
        _recentTools[sid] = []

        while (true) {
          const result = await streamFn(
            localLLMConfig.baseUrl,
            apiKey,
            localLLMConfig.model,
            localLLMConfig.maxTokens,
            localLLMConfig.temperature,
            llmMessages,
            (token) => updateLastAssistantToken(sid, token),
            controller.signal,
            toolDefs,
          )

          // No tool calls — final response
          if (!result.toolCalls || result.toolCalls.length === 0) {
            break
          }

          // ── Process tool calls ─────────────────────────────────────────
          rounds++
          if (rounds > MAX_TOOL_ROUNDS) {
            updateLastAssistantToken(sid, '\n\n⚠️ 工具调用轮次已达上限，停止执行。')
            break
          }

          // Finalize current assistant streaming message (text part)
          const msgs0 = useAppStore.getState().messagesBySession[sid] ?? []
          const lastAsst = msgs0[msgs0.length - 1]
          if (lastAsst?.streaming) {
            setMessages(sid, [...msgs0.slice(0, -1), { ...lastAsst, streaming: false }])
          }

          // Append assistant message with tool_calls to LLM context
          // (OpenAI format: assistant message contains tool_calls array)
          llmMessages.push({
            role: 'assistant',
            content: result.content || '',
            tool_calls: result.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            })),
          })

          // Execute each tool call
          for (const tc of result.toolCalls) {
            const callId = tc.id || uuidv4()
            roundToolCount++

            // Max tool calls per round guard
            if (roundToolCount > securityConfig.maxToolCallsPerRound) {
              const limitMsg = `[调用上限] 本轮已超过 ${securityConfig.maxToolCallsPerRound} 次工具调用上限`
              const toolCard: ToolCall = {
                callId,
                tool: tc.name,
                args: {},
                riskLevel: 'DENY',
                status: 'error',
                result: limitMsg,
              }
              appendMessage(sid, { id: uuidv4(), role: 'tool', content: limitMsg, toolCalls: [toolCard] })
              llmMessages.push({ role: 'tool', content: limitMsg, tool_call_id: callId })
              continue
            }

            // Loop guard
            if (securityConfig.loopGuard && detectLoop(sid, tc.name, securityConfig.loopGuardSensitivity)) {
              const loopMsg = `[循环守卫] 检测到工具 ${tc.name} 重复调用，已中断`
              const toolCard: ToolCall = {
                callId,
                tool: tc.name,
                args: {},
                riskLevel: 'DENY',
                status: 'error',
                result: loopMsg,
              }
              appendMessage(sid, { id: uuidv4(), role: 'tool', content: loopMsg, toolCalls: [toolCard] })
              llmMessages.push({ role: 'tool', content: loopMsg, tool_call_id: callId })
              continue
            }

            // Parse args
            let parsedArgs: Record<string, unknown> = {}
            try {
              parsedArgs = JSON.parse(tc.arguments || '{}')
            } catch {
              parsedArgs = {}
            }

            // Show executing UI card
            const toolCard: ToolCall = {
              callId,
              tool: tc.name,
              args: parsedArgs,
              riskLevel: 'LOW',
              status: 'executing',
            }
            appendMessage(sid, { id: uuidv4(), role: 'tool', content: '', toolCalls: [toolCard] })

            // Execute
            let toolResult: string
            try {
              const raw = await executeLocalTool(tc.name, parsedArgs)
              toolResult = typeof raw === 'string' ? raw : JSON.stringify(raw)
              useAppStore.getState().updateToolCallStatus(sid, callId, {
                status: 'done',
                result: toolResult.slice(0, 2000),
              })
            } catch (err: unknown) {
              toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`
              useAppStore.getState().updateToolCallStatus(sid, callId, {
                status: 'error',
                result: toolResult,
              })
            }

            // Track for loop detection
            _recentTools[sid] = [...(_recentTools[sid] ?? []), tc.name].slice(-10)
            useAppStore.getState().incrementToolCallCount(tc.name)

            // Append tool result to LLM context
            llmMessages.push({ role: 'tool', content: toolResult, tool_call_id: callId })
          }

          // Create new streaming placeholder for next round
          const nextMsgId = uuidv4()
          appendMessage(sid, { id: nextMsgId, role: 'assistant', content: '', streaming: true })
          setCatState('thinking')
        }
        // ── End Agentic Loop ─────────────────────────────────────────────

        // Mark final stream as done
        const msgs = useAppStore.getState().messagesBySession[sid] ?? []
        const last = msgs[msgs.length - 1]
        if (last?.streaming) {
          const finalMsg = { ...last, streaming: false }
          setMessages(sid, [...msgs.slice(0, -1), finalMsg])
          // Persist assistant message to backend or local SQLite
          const { serverUrl, token } = useAppStore.getState()
          if (token && !sid.startsWith('local-')) {
            persistMessage(serverUrl, token, sid, 'assistant', finalMsg.content)
          } else if (sid.startsWith('local-')) {
            const dbBridge = window.nekoBridge?.db
            if (dbBridge) {
              dbBridge.insertMessage({ id: msgId, sessionId: sid, role: 'assistant', content: finalMsg.content, toolCalls: null, tokenCount: finalMsg.content.length, createdAt: Date.now() }).catch(() => {})
            }
          }
          // 两段式标题：仅在第一轮对话（只有1条 user + 1条 assistant）时触发
          const isFirstRound = msgs.filter((m) => m.role === 'assistant').length === 1
          if (isFirstRound) {
            const { serverUrl: sv, token: tk } = useAppStore.getState()
            autoUpdateTitle(sid, content, finalMsg.content, localLLMConfig, sv, tk ?? '')
          }
          // 记忆提取（best-effort，后台执行，不阻塞 UI）
          const { serverUrl: msv, token: mtk } = useAppStore.getState()
          if (mtk) {
            const convMsgs = [...msgs.slice(0, -1), finalMsg]
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({ role: m.role, content: m.content }))
            extractMemoriesAsync(localLLMConfig, apiKey, convMsgs, msv, mtk).catch(() => {})
          }
        }
        setCatState('idle')
      } catch (e: unknown) {
        const msgs = useAppStore.getState().messagesBySession[sid] ?? []
        const last = msgs[msgs.length - 1]
        if (last?.streaming) {
          let errText = e instanceof Error ? e.message : String(e)
          if (errText === 'Failed to fetch') {
            const url = localLLMConfig.baseUrl || '（未配置）'
            errText = `无法连接到 ${url}\n请检查：① 服务是否运行 ② Base URL 是否正确 ③ 网络是否通畅`
          }
          setMessages(sid, [
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
