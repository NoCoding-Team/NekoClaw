"""
Tool definitions. Each tool specifies executor: "server" | "client".
Server tools are executed directly by the backend.
Client tools are forwarded to the PC desktop app via WebSocket.
"""
from typing import Any

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    # ── Server-side tools ──────────────────────────────────────────────
    {
        "name": "web_search",
        "executor": "server",
        "description": "Search the web for up-to-date information.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_url",
        "executor": "server",
        "description": (
            "获取网页内容，返回清洗后的 Markdown 纯文本。"
            "当需要获取任何 URL 的内容时，优先使用此工具。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "要获取的网页 URL"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "python_repl",
        "executor": "server",
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
        "name": "search_memory",
        "executor": "server",
        "description": (
            "搜索记忆库，返回与查询最相关的记忆片段。"
            "当需要从用户的长期记忆和每日笔记中查找信息时使用此工具。"
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
        "name": "http_request",
        "executor": "client",
        "description": "发送自定义 HTTP 请求。仅在需要自定义请求方法、Header、Body 或调用 REST API 时使用。",
        "parameters": {
            "type": "object",
            "properties": {
                "method": {"type": "string", "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"]},
                "url": {"type": "string"},
                "headers": {"type": "object", "default": {}},
                "body": {"type": "string", "default": ""},
            },
            "required": ["method", "url"],
        },
    },
    {
        "name": "memory_write",
        "executor": "server",
        "description": (
            "写入或更新一个 Markdown 记忆文件。"
            "长期记忆写入 MEMORY.md，当日笔记写入 YYYY-MM-DD.md。"
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
        "description": "读取一个记忆文件的内容。",
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
    {
        "name": "memory_search",
        "executor": "server",
        "description": "根据关键词搜索所有记忆文件，返回匹配的片段。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词",
                },
            },
            "required": ["query"],
        },
    },
    # ── Client-side tools ─────────────────────────────────────────────
    {
        "name": "file_read",
        "executor": "client",
        "description": "Read a local file.",
        "parameters": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "file_write",
        "executor": "client",
        "description": "Write content to a local file.",
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
        "description": "Delete a local file or directory.",
        "parameters": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "shell_exec",
        "executor": "client",
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
    {
        "name": "browser_navigate",
        "executor": "client",
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
        "description": "Take a screenshot of the current browser page.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "browser_click",
        "executor": "client",
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
    {
        "name": "read_skill",
        "executor": "server",
        "description": "Read an agent skill document or its resource files. Use this to load a SKILL.md when you identify a matching skill from available_skills.",
        "parameters": {
            "type": "object",
            "properties": {
                "skill": {"type": "string", "description": "Skill name (e.g. 'get-weather')"},
                "file": {"type": "string", "description": "Optional sub-file path. Defaults to SKILL.md"},
            },
            "required": ["skill"],
        },
    },
]

TOOL_MAP: dict[str, dict] = {t["name"]: t for t in TOOL_DEFINITIONS}

