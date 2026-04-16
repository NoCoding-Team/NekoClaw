/**
 * Context management utilities for Mode B local LLM.
 * Shared by useLocalLLM.ts and localTools.ts.
 */

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
