"""
Tool definitions. Each tool specifies executor: "server" | "client" and category.
Server tools are executed directly by the backend.
Client tools are forwarded to the PC desktop app via WebSocket.

Categories:
  internal  – infrastructure tools not shown in grouped tool descriptions
  memory    – memory search / read / write
  file      – local file CRUD
  execution – code & shell execution
  network   – web search & HTTP requests
  browser   – browser automation
"""
from typing import Any

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    # ── Network tools ──────────────────────────────────────────────────
    {
        "name": "web_search",
        "executor": "server",
        "category": "network",
        "description": "Search the web for up-to-date information.",        "requires": {
            "credentials": [
                {"key": "TAVILY_API_KEY", "label": "Tavily API Key", "hint": "从 app.tavily.com 获取"}
            ],
            "services": [],
        },        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "http_request",
        "executor": "server",
        "category": "network",
        "requires": None,
        "description": (
            "发送 HTTP 请求。设置 parse_html=true 时将 HTML 响应清洗为 Markdown 纯文本（适合读网页）；"
            "默认返回原始响应（适合调用 REST API）。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "method": {
                    "type": "string",
                    "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
                    "default": "GET",
                },
                "url": {"type": "string"},
                "headers": {"type": "object", "default": {}},
                "body": {"type": "string", "default": ""},
                "parse_html": {
                    "type": "boolean",
                    "default": False,
                    "description": "为 true 时将 HTML 清洗为 Markdown（原 fetch_url 行为）",
                },
            },
            "required": ["url"],
        },
    },

    # ── Execution tools ────────────────────────────────────────────────
    {
        "name": "python_repl",
        "executor": "server",
        "category": "execution",
        "requires": {
            "credentials": [],
            "services": ["docker"],
        },
        "description": (
            "在安全沙盒容器中执行 Python 代码。"
            "适用于数据计算、数学运算、文本处理、生成图表（matplotlib）等场景。"
            "预装库：numpy、pandas、matplotlib、scipy、sympy。"
            "无网络访问。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "要执行的 Python 代码"},
            },
            "required": ["code"],
        },
    },
    {
        "name": "shell_exec",
        "executor": "client",
        "category": "execution",
        "requires": None,
        "description": "Execute a shell command on the local machine.",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "cwd": {"type": "string", "default": "~"},
            },
            "required": ["command"],
        },
    },

    # ── Memory tools ───────────────────────────────────────────────────
    {
        "name": "search_memory",
        "executor": "server",
        "category": "memory",
        "requires": {
            "credentials": [],
            "services": ["milvus"],
        },
        "description": (
            "搜索用户的长期记忆和每日笔记，返回与查询最相关的片段。"
            "这是查询历史记忆、近期笔记、之前是否提过某事的默认入口；"
            "不要为了普通历史查询直接读取完整文件。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索查询文本"},
                "top_k": {"type": "integer", "default": 5, "description": "返回结果数量"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "memory_write",
        "executor": "server",
        "category": "memory",
        "requires": None,
        "description": (
            "写入或更新一个 Markdown 记忆文件。"
            "仅在用户明确要求保存，或需要保存长期事实、稳定偏好、重要决策时使用；"
            "写入前应先用 memory_read 读取目标文件旧内容并整理成完整文件。"
            "不要保存定时任务的临时输出、一次性查询或中间步骤。"
            "保存用户偏好、关键事实、重要决策时必须使用此工具，不要使用 file_write。"
            "长期记忆写入 MEMORY.md，当日笔记写入 notes/YYYY-MM-DD.md。"
            "写入时请提供文件的完整内容（会覆盖原文件）。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件路径，如 MEMORY.md 或 2025-01-01.md",
                },
                "content": {
                    "type": "string",
                    "description": "Markdown 格式的文件内容",
                },
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "memory_read",
        "executor": "server",
        "category": "memory",
        "requires": None,
        "description": (
            "读取一个明确指定的记忆文件完整内容。"
            "仅当用户指定 MEMORY.md、USER.md、SOUL.md、IDENTITY.md、某个 notes/YYYY-MM-DD.md，"
            "或写入前需要读取旧内容时使用；普通历史查询应优先使用 search_memory。"
            "读取记忆文件时必须使用此工具，不要使用 file_read。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件路径，如 MEMORY.md",
                },
            },
            "required": ["path"],
        },
    },

    # ── File tools ─────────────────────────────────────────────────────
    {
        "name": "file_read",
        "executor": "client",
        "category": "file",
        "requires": None,
        "description": "Read a local file. Do not use for memory files; use memory_read for MEMORY.md, USER.md, or notes/YYYY-MM-DD.md.",
        "parameters": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "file_write",
        "executor": "client",
        "category": "file",
        "requires": None,
        "description": "Write content to a local file. Do not use for memory files; use memory_write for MEMORY.md, USER.md, or notes/YYYY-MM-DD.md.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "file_list",
        "executor": "client",
        "category": "file",
        "requires": None,
        "description": "List files in a directory.",
        "parameters": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "file_delete",
        "executor": "client",
        "category": "file",
        "requires": None,
        "description": "Delete a local file or directory.",
        "parameters": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },

    # ── Browser tools ──────────────────────────────────────────────────
    {
        "name": "browser_navigate",
        "executor": "client",
        "category": "browser",
        "requires": None,
        "description": "Navigate to a URL in the browser.",
        "parameters": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        },
    },
    {
        "name": "browser_screenshot",
        "executor": "client",
        "category": "browser",
        "requires": None,
        "description": "Take a screenshot of the current browser page.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "browser_click",
        "executor": "client",
        "category": "browser",
        "requires": None,
        "description": "Click an element on the browser page.",
        "parameters": {
            "type": "object",
            "properties": {"selector": {"type": "string"}},
            "required": ["selector"],
        },
    },
    {
        "name": "browser_type",
        "executor": "client",
        "category": "browser",
        "requires": None,
        "description": "Type text into an element on the browser page.",
        "parameters": {
            "type": "object",
            "properties": {
                "selector": {"type": "string"},
                "text": {"type": "string"},
            },
            "required": ["selector", "text"],
        },
    },

    # ── Internal tools ─────────────────────────────────────────────────
    {
        "name": "read_skill",
        "executor": "server",
        "category": "internal",
        "requires": None,
        "description": "Read an agent skill document by its file path. Pass the <location> value from <available_skills> to load the full SKILL.md content.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "Full absolute path to the SKILL.md file, taken from the <location> field in <available_skills>"},
            },
            "required": ["location"],
        },
    },
]

TOOL_MAP: dict[str, dict] = {t["name"]: t for t in TOOL_DEFINITIONS}

