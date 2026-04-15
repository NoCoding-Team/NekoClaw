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
        "name": "http_request",
        "executor": "server",
        "description": "Make an HTTP request to an external URL.",
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
]

TOOL_MAP: dict[str, dict] = {t["name"]: t for t in TOOL_DEFINITIONS}


def get_openai_tools(allowed_tools: list[str] | None = None) -> list[dict]:
    """Return tools formatted for OpenAI-compatible API, optionally filtered by whitelist."""
    tools = TOOL_DEFINITIONS if allowed_tools is None else [
        t for t in TOOL_DEFINITIONS if t["name"] in allowed_tools
    ]
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        }
        for t in tools
    ]
