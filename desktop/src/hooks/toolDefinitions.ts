/**
 * LLM function calling tool definitions for Mode B (local direct LLM).
 * Format: OpenAI function calling schema.
 */

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

// ── Memory tools (always included) ─────────────────────────────────────────

const MEMORY_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'memory_read',
      description:
        '读取记忆文件内容。path 为相对路径，如 "MEMORY.md" 或 "2026-01-15.md"。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于 memory 目录的 .md 文件路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_write',
      description:
        '写入记忆文件。用于保存长期记忆到 MEMORY.md 或每日笔记到 YYYY-MM-DD.md。如文件不存在则创建。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于 memory 目录的 .md 文件路径' },
          content: { type: 'string', description: '要写入的完整 Markdown 内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_search',
      description:
        '搜索记忆文件。根据关键词搜索所有记忆文件内容，返回匹配的片段。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      },
    },
  },
]

// ── Client-side file / shell / browser tools ────────────────────────────────

const CLIENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'file_read',
      description: '读取本地文件内容。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件绝对路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_write',
      description: '写入内容到本地文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件绝对路径' },
          content: { type: 'string', description: '文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_list',
      description: '列出目录下的文件和子目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录绝对路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_delete',
      description: '删除本地文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件绝对路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'shell_exec',
      description: '执行 shell 命令。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
        },
        required: ['command'],
      },
    },
  },
]

/**
 * Get tool definitions for Mode B LLM calls.
 * Memory tools are always included; other client tools are filtered by allowedTools.
 * Pass `[]` to disable all client tools; pass `null`/`undefined` to include all.
 */
export function getLocalToolDefinitions(allowedTools?: string[] | null): ToolDefinition[] {
  const tools = [...MEMORY_TOOLS]
  if (Array.isArray(allowedTools)) {
    tools.push(...CLIENT_TOOLS.filter((t) => allowedTools.includes(t.function.name)))
  } else {
    tools.push(...CLIENT_TOOLS)
  }
  return tools
}
