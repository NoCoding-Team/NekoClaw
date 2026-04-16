/**
 * Context management utilities for Mode B local LLM.
 * Shared by useLocalLLM.ts and localTools.ts.
 */
import { executeLocalTool } from './localTools'

// ── Types for LLM call delegation ─────────────────────────────────────────

/** Minimal LLM stream function signature (injected from useLocalLLM to avoid circular deps). */
export type StreamFn = (
  baseUrl: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
  messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[],
  onToken: (t: string) => void,
  signal: AbortSignal,
  tools?: unknown[],
) => Promise<{ content: string; toolCalls: { id: string; name: string; arguments: string }[] | null; finishReason: string }>

export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Max characters for a single tool result sent to LLM context */
export const MAX_TOOL_RESULT_CHARS = 8000
/** Max characters for a single tool result considered "large" even in recent rounds */
const MAX_TOOL_RESULT_TOKENS = 4000

// ── Token Estimation ───────────────────────────────────────────────────────

/** Estimate token count from text length (Chinese/English mixed heuristic). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.6)
}

/** Estimate total tokens for an array of LLM messages. */
export function estimateMessagesTokens(
  messages: { role: string; content: string; tool_calls?: unknown }[],
): number {
  let total = 0
  for (const m of messages) {
    total += estimateTokens(m.content || '')
    if (m.tool_calls) {
      total += estimateTokens(JSON.stringify(m.tool_calls))
    }
  }
  return total
}

// ── Tool Result Truncation ─────────────────────────────────────────────────

/** Truncate a single tool result string for LLM context (keeps head + tail). */
export function truncateToolResult(result: string): string {
  if (result.length <= MAX_TOOL_RESULT_CHARS) return result
  return (
    result.slice(0, 6000) +
    '\n...[输出过长已截断]...\n' +
    result.slice(-1500)
  )
}

// ── Session Pruning ────────────────────────────────────────────────────────

/**
 * Prune tool results in message history based on distance from current round.
 *
 * Strategy (3-tier):
 *   - Last 3 rounds: keep full (unless single result > MAX_TOOL_RESULT_TOKENS chars)
 *   - 4-8 rounds ago: soft trim (first 300 + marker + last 200)
 *   - >8 rounds ago: hard clear → "[工具输出已省略]"
 *
 * A "round" = one assistant message (with or without tool_calls) + subsequent tool messages.
 * Returns a new array — does NOT mutate the input.
 */
export function pruneToolResults(
  messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[],
): { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[] {
  // First, identify rounds. Walk backwards to assign round numbers.
  // Each assistant message starts a new round (counting from the end).
  const roundIndex: number[] = new Array(messages.length).fill(0)
  let currentRound = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    roundIndex[i] = currentRound
    if (messages[i].role === 'assistant') {
      currentRound++
    }
  }

  return messages.map((m, i) => {
    if (m.role !== 'tool') return { ...m }
    const distance = roundIndex[i]
    const content = m.content || ''

    // Recent 3 rounds: keep, but soft-trim if single result is oversized
    if (distance < 3) {
      if (content.length > MAX_TOOL_RESULT_TOKENS) {
        return { ...m, content: softTrim(content) }
      }
      return { ...m }
    }

    // 4-8 rounds: soft trim
    if (distance < 8) {
      return { ...m, content: softTrim(content) }
    }

    // >8 rounds: hard clear
    return { ...m, content: '[工具输出已省略]' }
  })
}

function softTrim(content: string): string {
  if (content.length <= 500) return content
  return content.slice(0, 300) + '\n...[已裁剪]...\n' + content.slice(-200)
}

// ── Memory Refresh ─────────────────────────────────────────────────────────

/** Per-session guard: memory refresh fires at most once per session. */
const _memoryRefreshDone = new Set<string>()

/**
 * Pre-compaction memory refresh: silently ask the LLM to save important memories
 * before history is compressed away. Fires at most once per session.
 */
export async function memoryRefresh(
  sessionId: string,
  messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[],
  config: LLMConfig,
  streamFn: StreamFn,
): Promise<void> {
  if (_memoryRefreshDone.has(sessionId)) return
  _memoryRefreshDone.add(sessionId)

  // Build a condensed view of recent conversation
  const recent = messages.slice(-20)
  const convText = recent.map((m) => `${m.role}: ${m.content || ''}`).join('\n')

  // Load existing memory to avoid redundant saves
  let existingBlock = ''
  try {
    const raw = await executeLocalTool('memory_read', { path: 'MEMORY.md' })
    const content = (raw as { content?: string }).content ?? ''
    if (content) existingBlock = `\n\n已有记忆:\n${content}`
  } catch { /* ignore */ }

  const memoryTools = [
    {
      type: 'function' as const,
      function: {
        name: 'memory_read',
        description: '读取记忆文件',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'memory_write',
        description: '写入记忆文件',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } },
          required: ['path', 'content'],
        },
      },
    },
  ]

  const refreshMessages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[] = [
    {
      role: 'system',
      content:
        '你是记忆整理助手。请检查以下对话，找出值得长期保存的用户信息（偏好、事实、指令等）。\n' +
        '使用 memory_read 读取 MEMORY.md，追加新条目后用 memory_write 写回。\n' +
        '临时信息和一次性任务不需要保存。每次最多操作 3 次工具调用。' +
        existingBlock,
    },
    { role: 'user', content: `请分析以下对话：\n\n${convText}` },
  ]

  try {
    let currentMessages = [...refreshMessages]
    for (let round = 0; round < 3; round++) {
      const result = await streamFn(
        config.baseUrl, config.apiKey, config.model,
        config.maxTokens, 0.3, currentMessages,
        () => {}, // silent — no token output
        new AbortController().signal,
        memoryTools,
      )
      if (!result.toolCalls || result.toolCalls.length === 0) break

      // Append assistant message with tool calls
      currentMessages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls.map((tc) => ({
          id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments },
        })),
      })

      // Execute each tool call
      for (const tc of result.toolCalls) {
        let toolResult: string
        try {
          const args = JSON.parse(tc.arguments || '{}')
          const raw = await executeLocalTool(tc.name, args)
          toolResult = typeof raw === 'string' ? raw : JSON.stringify(raw)
        } catch (err) {
          toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`
        }
        currentMessages.push({ role: 'tool', content: toolResult, tool_call_id: tc.id })
      }
    }
  } catch {
    // Memory refresh is best-effort, never crash the main pipeline
  }
}

// ── Compaction ──────────────────────────────────────────────────────────────

export interface CompactResult {
  /** New message list to use for LLM (summary + recent messages). */
  messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[]
  /** The generated summary text (for persistence). */
  summary: string
}

/**
 * Compact history by summarizing old messages via LLM.
 * Keeps last 20 messages, summarizes the rest.
 * Returns new message list with summary replacing old messages.
 */
export async function compactHistory(
  messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[],
  config: LLMConfig,
  streamFn: StreamFn,
): Promise<CompactResult> {
  // Find system prompt — always first
  const systemMsgs = messages.filter((m) => m.role === 'system')
  const nonSystem = messages.filter((m) => m.role !== 'system')

  if (nonSystem.length <= 20) {
    return { messages, summary: '' }
  }

  const toCompress = nonSystem.slice(0, -20)
  const toKeep = nonSystem.slice(-20)

  const conversationText = toCompress
    .map((m) => `${m.role}: ${m.content || ''}`)
    .join('\n')

  const summaryPrompt: { role: string; content: string }[] = [
    { role: 'system', content: '请将以下对话历史压缩为简洁摘要，保留关键信息和决策：' },
    { role: 'user', content: conversationText },
  ]

  let summary = '（历史对话已压缩）'
  try {
    let generated = ''
    await streamFn(
      config.baseUrl, config.apiKey, config.model,
      config.maxTokens, 0.3, summaryPrompt,
      (t) => { generated += t },
      new AbortController().signal,
    )
    if (generated.trim()) summary = generated.trim()
  } catch {
    // Use fallback summary
  }

  const summaryMsg = { role: 'system' as const, content: `[对话历史摘要]\n${summary}` }
  return {
    messages: [...systemMsgs, summaryMsg, ...toKeep],
    summary,
  }
}
