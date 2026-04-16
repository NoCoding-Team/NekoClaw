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
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: '控制本地浏览器导航到指定 URL。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要访问的 URL' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: '截取当前浏览器页面的截图，返回 base64 图片。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: '点击浏览器页面中的指定元素（CSS 选择器或坐标）。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          x: { type: 'number', description: '点击 X 坐标（与 selector 二选一）' },
          y: { type: 'number', description: '点击 Y 坐标（与 selector 二选一）' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: '在浏览器页面指定元素中输入文字。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          text: { type: 'string', description: '要输入的文字' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '通过 Tavily 搜索引擎搜索互联网实时信息，支持新闻、文档、技术内容等。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'http_request',
      description: '向任意外部接口发送 GET、POST 等 HTTP 请求，可用于调用 API、获取数据。',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'HTTP 方法，如 GET、POST', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
          url: { type: 'string', description: '请求 URL' },
          headers: { type: 'object', description: '请求头（可选）' },
          body: { type: 'string', description: '请求体（可选，JSON 字符串）' },
        },
        required: ['method', 'url'],
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
