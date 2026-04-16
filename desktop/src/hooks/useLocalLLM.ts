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
import type { ToolCall } from '../store/app'
import { executeLocalTool } from './localTools'
import { getLocalToolDefinitions } from './toolDefinitions'
import { truncateToolResult, estimateMessagesTokens, pruneToolResults, memoryRefresh, compactHistory } from './contextUtils'
import type { LLMConfig as ContextLLMConfig, StreamFn } from './contextUtils'
import { apiFetch } from '../api/apiFetch'

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

// ── Hook ───────────────────────────────────────────────────────────────────
async function persistMessage(
  serverUrl: string,
  _token: string,
  sessionId: string,
  role: 'user' | 'assistant' | 'tool',
  content: string,
  toolCalls?: unknown[] | null,
) {
  try {
    const body: Record<string, unknown> = { role, content }
    if (toolCalls && toolCalls.length > 0) body.tool_calls = toolCalls
    await apiFetch(`${serverUrl}/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

async function patchSessionTitle(serverUrl: string, _token: string, sessionId: string, title: string) {
  try {
    await apiFetch(`${serverUrl}/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
            const res = await apiFetch(`${sv}/api/sessions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
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

      // ── Memory injection ──────────────────────────────────────────────
      let memoryBlock = ''
      try {
        const memBridge = window.nekoBridge?.memory
        if (memBridge) {
          // Read MEMORY.md (long-term)
          const longTermRaw = await memBridge.read('MEMORY.md').catch(() => ({ content: '' }))
          const longTermContent = (longTermRaw as { content?: string }).content ?? ''

          // Read today + yesterday daily notes
          const today = new Date()
          const yesterday = new Date(today)
          yesterday.setDate(yesterday.getDate() - 1)
          const fmt = (d: Date) => d.toISOString().slice(0, 10)
          const todayFile = `${fmt(today)}.md`
          const yesterdayFile = `${fmt(yesterday)}.md`
          const [todayRaw, yesterdayRaw] = await Promise.all([
            memBridge.read(todayFile).catch(() => ({ content: '' })),
            memBridge.read(yesterdayFile).catch(() => ({ content: '' })),
          ])
          const todayContent = (todayRaw as { content?: string }).content ?? ''
          const yesterdayContent = (yesterdayRaw as { content?: string }).content ?? ''

          // Build memory block (truncate long-term to ~4000 chars ≈ 4000 tokens)
          const MAX_LONG_TERM_CHARS = 4000
          const truncatedLongTerm = longTermContent.length > MAX_LONG_TERM_CHARS
            ? longTermContent.slice(0, MAX_LONG_TERM_CHARS) + '\n...(已截断)'
            : longTermContent

          const parts: string[] = []
          if (truncatedLongTerm.trim()) {
            parts.push(`## 长期记忆\n${truncatedLongTerm}`)
          }
          const dailyParts: string[] = []
          if (yesterdayContent.trim()) dailyParts.push(`### ${fmt(yesterday)}\n${yesterdayContent}`)
          if (todayContent.trim()) dailyParts.push(`### ${fmt(today)}\n${todayContent}`)
          if (dailyParts.length > 0) {
            parts.push(`## 近期笔记\n${dailyParts.join('\n\n')}`)
          }
          if (parts.length > 0) memoryBlock = parts.join('\n\n')
        }
      } catch {
        // Memory injection is best-effort
      }

      const MEMORY_GUIDANCE = `\n## 工具使用规则（最高优先级）
1. 工具列表中出现的工具已获得用户授权，需要时直接调用，不要询问确认。
2. **调用工具后必须用自然语言向用户反馈结果**，例如"好的，我已经记住了～"、"文件已写入"等。严禁工具执行后保持沉默。
3. 多步任务时连续调用多个工具，全部完成后再一起总结。

## 记忆管理规则
你拥有持久记忆系统，通过 memory_write / memory_read / memory_search 工具管理：
- **MEMORY.md**：长期记忆——用户偏好、关键事实、重要决策、个人信息。
- **YYYY-MM-DD.md**（如 2026-04-16.md）：每日笔记——当天对话要点、讨论话题、结论。

### 何时写入记忆（发现以下情况时立即执行）
- 用户透露偏好（语言、格式、工具选择、沟通风格等）→ 写入 MEMORY.md
- 用户提到关于自己的重要事实（职业、项目、技术栈、习惯等）→ 写入 MEMORY.md
- 用户做出重要决策或给出关键指令 → 写入 MEMORY.md
- 用户纠正之前的错误信息 → 读取并更新 MEMORY.md 对应内容
- 对话产生有价值的结论、方案、要点 → 写入当日 YYYY-MM-DD.md
- 用户明确要求"记住..."、"下次..." → 写入 MEMORY.md

### 写入流程
1. 先 memory_read 读取目标文件已有内容
2. 在已有内容基础上追加新条目（不要覆写已有内容）
3. 用 memory_write 写回完整内容

### 不需要写入的内容
- 当前任务的临时中间步骤
- 大段代码或文件内容原文`

      // Prepend system prompt from personalization config
      const baseSystemPrompt = useAppStore.getState().personalizationConfig?.systemPrompt ?? ''
      const systemPromptParts = [baseSystemPrompt, memoryBlock, MEMORY_GUIDANCE].filter(Boolean)
      const systemPrompt = systemPromptParts.join('\n\n')

      const history = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...allMsgs
          // 保留 user / assistant / tool 三种 role；
          // 仅过滤：content 为空且没有 tool_calls 的 assistant 消息（agentic loop 空 streaming 占位）
          .filter((m) => {
            if (m.role === 'user' || m.role === 'tool') return true
            if (m.role === 'assistant') {
              // 有 tool_calls 的 assistant 消息即使 content 为空也保留
              if (m.toolCalls && (Array.isArray(m.toolCalls) ? m.toolCalls.length > 0 : true)) return true
              return (m.content ?? '').trim() !== ''
            }
            return false
          })
          .map((m) => {
            const entry: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string } = {
              role: m.role,
              content: m.content ?? '',
            }
            // Restore tool_calls on assistant messages
            if (m.role === 'assistant' && m.toolCalls && Array.isArray(m.toolCalls)) {
              entry.tool_calls = m.toolCalls.map((tc: Record<string, unknown>) => ({
                id: tc.callId ?? tc.id ?? '',
                type: 'function',
                function: { name: tc.tool ?? tc.name ?? '', arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args ?? {}) },
              }))
            }
            // Restore tool_call_id on tool messages
            if (m.role === 'tool' && m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
              entry.tool_call_id = (m.toolCalls[0] as Record<string, unknown>).callId as string ?? ''
            }
            return entry
          }),
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
      // 仅当用户开启「同步到云端」时才联系服务器，否则完全离线
      let enhancedHistory = history
      try {
        const { serverUrl: sv, token: tk, syncEnabled: se } = useAppStore.getState()
        if (tk && se) {
          const res = await apiFetch(`${sv}/api/llm/enhance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

        // ── Pre-send Compaction check ──────────────────────────────────────
        const contextLimit = localLLMConfig.contextLimit ?? localLLMConfig.maxTokens * 4
        const totalTokens = estimateMessagesTokens(enhancedHistory)
        if (totalTokens > contextLimit * 0.70 && enhancedHistory.length > 10) {
          const ctxConfig: ContextLLMConfig = {
            baseUrl: localLLMConfig.baseUrl,
            apiKey,
            model: localLLMConfig.model,
            maxTokens: localLLMConfig.maxTokens,
            temperature: localLLMConfig.temperature,
          }
          // Step 1: Memory Refresh (best-effort, once per session)
          await memoryRefresh(sid, enhancedHistory, ctxConfig, streamFn as StreamFn)
          // Step 2: Compact history (LLM summary)
          const compacted = await compactHistory(enhancedHistory, ctxConfig, streamFn as StreamFn)
          if (compacted.summary) {
            enhancedHistory = compacted.messages
            // Persist summary to SQLite
            const dbBridge = window.nekoBridge?.db
            if (dbBridge && sid.startsWith('local-')) {
              dbBridge.insertMessage({
                id: uuidv4(),
                sessionId: sid,
                role: 'system',
                content: `[对话历史摘要]\n${compacted.summary}`,
                toolCalls: null,
                tokenCount: compacted.summary.length,
                createdAt: Date.now(),
              }).catch(() => {})
            }
          }
        }

        // Build tool definitions
        const { securityConfig } = useAppStore.getState()
        const toolDefs = getLocalToolDefinitions(
          securityConfig.toolWhitelist?.length ? securityConfig.toolWhitelist : null,
        )

        // ── Agentic Loop ───────────────────────────────────────────────────
        // Messages array for the LLM (mutable, accumulates tool results)
        let llmMessages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[] =
          enhancedHistory.map((m) => ({ ...m }))

        // Pre-send Session Pruning: trim old tool results to save context budget
        llmMessages = pruneToolResults(llmMessages)

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

          // Persist intermediate assistant message (with tool_calls) to server
          const openaiToolCalls = result.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          }))
          if (!sid.startsWith('local-')) {
            const { serverUrl: svA, token: tkA } = useAppStore.getState()
            if (tkA) {
              persistMessage(svA, tkA, sid, 'assistant', result.content || '', openaiToolCalls)
            }
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
          let loopAborted = false
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
              const toolMsgId = uuidv4()
              appendMessage(sid, { id: toolMsgId, role: 'tool', content: limitMsg, toolCalls: [toolCard] })
              if (sid.startsWith('local-')) {
                window.nekoBridge?.db?.insertMessage({ id: toolMsgId, sessionId: sid, role: 'tool', content: limitMsg, toolCalls: JSON.stringify([toolCard]), tokenCount: 0, createdAt: Date.now() }).catch(() => {})
              } else {
                const { serverUrl: svLim, token: tkLim } = useAppStore.getState()
                if (tkLim) persistMessage(svLim, tkLim, sid, 'tool', limitMsg, [toolCard])
              }
              llmMessages.push({ role: 'tool', content: limitMsg, tool_call_id: callId })
              loopAborted = true
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
              const toolMsgId = uuidv4()
              appendMessage(sid, { id: toolMsgId, role: 'tool', content: loopMsg, toolCalls: [toolCard] })
              if (sid.startsWith('local-')) {
                window.nekoBridge?.db?.insertMessage({ id: toolMsgId, sessionId: sid, role: 'tool', content: loopMsg, toolCalls: JSON.stringify([toolCard]), tokenCount: 0, createdAt: Date.now() }).catch(() => {})
              } else {
                const { serverUrl: svLoop, token: tkLoop } = useAppStore.getState()
                if (tkLoop) persistMessage(svLoop, tkLoop, sid, 'tool', loopMsg, [toolCard])
              }
              llmMessages.push({ role: 'tool', content: loopMsg, tool_call_id: callId })
              loopAborted = true
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
            const toolMsgId = uuidv4()
            appendMessage(sid, { id: toolMsgId, role: 'tool', content: '', toolCalls: [toolCard] })

            // Execute
            let toolResult = ''
            let toolFinalStatus: 'done' | 'error' = 'done'
            try {
              const raw = await executeLocalTool(tc.name, parsedArgs)
              toolResult = typeof raw === 'string' ? raw : JSON.stringify(raw)
              useAppStore.getState().updateToolCallStatus(sid, callId, {
                status: 'done',
                result: toolResult.slice(0, 2000),
              })
            } catch (err: unknown) {
              toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`
              toolFinalStatus = 'error'
              useAppStore.getState().updateToolCallStatus(sid, callId, {
                status: 'error',
                result: toolResult,
              })
            }

            // Persist tool message
            const finalCard: ToolCall = { ...toolCard, status: toolFinalStatus, result: toolResult.slice(0, 2000) }
            if (sid.startsWith('local-')) {
              window.nekoBridge?.db?.insertMessage({ id: toolMsgId, sessionId: sid, role: 'tool', content: toolResult.slice(0, 2000), toolCalls: JSON.stringify([finalCard]), tokenCount: 0, createdAt: Date.now() }).catch(() => {})
            } else {
              const { serverUrl: svTool, token: tkTool } = useAppStore.getState()
              if (tkTool) {
                persistMessage(svTool, tkTool, sid, 'tool', toolResult.slice(0, 2000), [finalCard])
              }
            }

            // Track for loop detection
            _recentTools[sid] = [...(_recentTools[sid] ?? []), tc.name].slice(-10)
            useAppStore.getState().incrementToolCallCount(tc.name)

            // Append tool result to LLM context (truncated for context budget)
            llmMessages.push({ role: 'tool', content: truncateToolResult(toolResult), tool_call_id: callId })
          }

          // ── Mid-loop context safety check ────────────────────────────────
          if (!loopAborted) {
            const midTokens = estimateMessagesTokens(llmMessages)
            if (midTokens > contextLimit * 0.85) {
              // 85% threshold: prune tool results
              llmMessages = pruneToolResults(llmMessages)
              // Re-check after pruning
              const afterPrune = estimateMessagesTokens(llmMessages)
              if (afterPrune > contextLimit * 0.90) {
                // 90% threshold: emergency compact (no memory refresh)
                const ctxConfig: ContextLLMConfig = {
                  baseUrl: localLLMConfig.baseUrl,
                  apiKey,
                  model: localLLMConfig.model,
                  maxTokens: localLLMConfig.maxTokens,
                  temperature: localLLMConfig.temperature,
                }
                const compacted = await compactHistory(llmMessages, ctxConfig, streamFn as StreamFn)
                if (compacted.summary) {
                  llmMessages = compacted.messages
                }
              }
            }
          }

          // Create new streaming placeholder for next round (skip if loop was aborted)
          if (loopAborted) break
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
          const isFirstRound = msgs.filter((m) => m.role === 'user').length === 1
          if (isFirstRound) {
            const { serverUrl: sv, token: tk } = useAppStore.getState()
            autoUpdateTitle(sid, content, finalMsg.content, localLLMConfig, sv, tk ?? '')
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
