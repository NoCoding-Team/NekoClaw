"""
Server-side tool execution: web_search, http_request, save_memory, update_memory.
"""
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import settings


async def execute_web_search(args: dict[str, Any]) -> str:
    query = args["query"]
    max_results = args.get("max_results", 5)

    if not settings.TAVILY_API_KEY:
        return json.dumps({"error": "Web search is not configured (no TAVILY_API_KEY)"})

    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=settings.TAVILY_API_KEY)
        response = client.search(query=query, max_results=max_results)
        results = [
            {"title": r.get("title"), "url": r.get("url"), "content": r.get("content")}
            for r in response.get("results", [])
        ]
        return json.dumps(results, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


async def execute_http_request(args: dict[str, Any]) -> str:
    method = args["method"].upper()
    url = args["url"]
    headers = args.get("headers", {})
    body = args.get("body", "")

    # SSRF prevention: block private/loopback addresses
    import ipaddress
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    hostname = parsed.hostname or ""
    try:
        addr = ipaddress.ip_address(hostname)
        if addr.is_private or addr.is_loopback or addr.is_link_local:
            return json.dumps({"error": "SSRF: requests to private/loopback addresses are blocked"})
    except ValueError:
        pass  # hostname, not an IP — allow (DNS will resolve)
    if hostname in ("localhost", "127.0.0.1", "::1"):
        return json.dumps({"error": "SSRF: requests to localhost are blocked"})

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                content=body.encode() if body else None,
            )
            return json.dumps({
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "body": response.text[:10000],  # cap response size
            }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


async def execute_server_tool(tool_name: str, args: dict[str, Any], user_id: str | None = None) -> str:
    if tool_name == "web_search":
        return await execute_web_search(args)
    elif tool_name == "http_request":
        return await execute_http_request(args)
    elif tool_name == "save_memory":
        return await execute_save_memory(args, user_id)
    elif tool_name == "update_memory":
        return await execute_update_memory(args, user_id)
    return json.dumps({"error": f"Unknown server tool: {tool_name}"})


_CTRL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

def _sanitize(text: str) -> str:
    return _CTRL_CHARS.sub(" ", text)[:1000]


async def execute_save_memory(args: dict[str, Any], user_id: str | None) -> str:
    if not user_id:
        return json.dumps({"error": "user_id required for save_memory"})

    VALID_CATEGORIES = {"preference", "fact", "instruction", "history", "other"}
    category = args.get("category", "other")
    if category not in VALID_CATEGORIES:
        category = "other"
    content = _sanitize(str(args.get("content", "")))
    if not content:
        return json.dumps({"error": "content must not be empty"})

    from app.models.base import AsyncSessionLocal
    from app.models.memory import Memory
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        # Dedup: skip if identical content already exists
        result = await db.execute(
            select(Memory).where(
                Memory.user_id == user_id,
                Memory.content == content,
                Memory.deleted_at.is_(None),
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            return json.dumps({"ok": True, "id": existing.id, "duplicate": True})

        mem = Memory(
            id=str(uuid.uuid4()),
            user_id=user_id,
            category=category,
            content=content,
            last_used_at=datetime.now(timezone.utc),
        )
        db.add(mem)
        await db.commit()
        return json.dumps({"ok": True, "id": mem.id})


async def execute_update_memory(args: dict[str, Any], user_id: str | None) -> str:
    if not user_id:
        return json.dumps({"error": "user_id required for update_memory"})

    VALID_CATEGORIES = {"preference", "fact", "instruction", "history", "other"}
    old_content = str(args.get("old_content", ""))
    new_content = _sanitize(str(args.get("new_content", "")))
    category = args.get("category", "other")
    if category not in VALID_CATEGORIES:
        category = "other"
    if not new_content:
        return json.dumps({"error": "new_content must not be empty"})

    from app.models.base import AsyncSessionLocal
    from app.models.memory import Memory
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Memory).where(
                Memory.user_id == user_id,
                Memory.content == old_content,
                Memory.deleted_at.is_(None),
            )
        )
        mem = result.scalar_one_or_none()
        if not mem:
            return json.dumps({"error": "Memory not found", "old_content": old_content})
        mem.content = new_content
        mem.category = category
        mem.last_used_at = datetime.now(timezone.utc)
        mem.version = (mem.version or 0) + 1
        await db.commit()
        return json.dumps({"ok": True, "id": mem.id})
