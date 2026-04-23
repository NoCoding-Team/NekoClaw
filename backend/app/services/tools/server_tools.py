"""
Server-side tool execution: web_search, http_request, memory_write, memory_read, memory_search.
Legacy: save_memory, update_memory (DB-based, kept for backward compatibility).
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import settings


# ── SSRF prevention ────────────────────────────────────────────────────────

def _check_ssrf(url: str) -> str | None:
    """Return error string if URL targets private/loopback, else None."""
    import ipaddress
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    hostname = parsed.hostname or ""
    try:
        addr = ipaddress.ip_address(hostname)
        if addr.is_private or addr.is_loopback or addr.is_link_local:
            return "SSRF: requests to private/loopback addresses are blocked"
    except ValueError:
        pass
    if hostname in ("localhost", "127.0.0.1", "::1"):
        return "SSRF: requests to localhost are blocked"
    return None


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

    ssrf_err = _check_ssrf(url)
    if ssrf_err:
        return json.dumps({"error": ssrf_err})

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


async def execute_fetch_url(args: dict[str, Any]) -> str:
    url = args.get("url", "")
    if not url:
        return json.dumps({"error": "url is required"})

    ssrf_err = _check_ssrf(url)
    if ssrf_err:
        return json.dumps({"error": ssrf_err})

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            response = await client.get(url, headers={"User-Agent": "NekoClaw/1.0"})

        content_type = response.headers.get("content-type", "")

        # Binary content — not supported
        if any(t in content_type for t in ("application/pdf", "image/", "audio/", "video/", "application/octet-stream")):
            return json.dumps({"error": f"Unsupported content type: {content_type.split(';')[0]}"})

        # Non-HTML (JSON, plain text, etc.) — return raw truncated
        if "text/html" not in content_type:
            return json.dumps({
                "url": str(response.url),
                "content_type": content_type.split(";")[0].strip(),
                "body": response.text[:4000],
            }, ensure_ascii=False)

        # HTML — clean to Markdown
        from bs4 import BeautifulSoup
        import html2text

        soup = BeautifulSoup(response.text, "html.parser")
        # Remove noise elements
        for tag in soup.find_all(["script", "style", "nav", "footer", "header", "noscript", "iframe"]):
            tag.decompose()

        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = True
        h.body_width = 0  # no line wrapping
        markdown = h.handle(str(soup))

        return json.dumps({
            "url": str(response.url),
            "title": soup.title.string.strip() if soup.title and soup.title.string else "",
            "body": markdown[:4000],
        }, ensure_ascii=False)

    except httpx.TimeoutException:
        return json.dumps({"error": f"Request timed out after 15s: {url}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


async def execute_python_repl(args: dict[str, Any]) -> str:
    code = args.get("code", "")
    if not code.strip():
        return json.dumps({"error": "code is required"})

    from app.services.tools.container import check_docker, ensure_sandbox_image, run_python_in_container

    if not await check_docker():
        return json.dumps({"error": "Docker is not available. python_repl requires Docker to run."})

    if not await ensure_sandbox_image():
        return json.dumps({"error": "Sandbox image is not ready. Please try again later."})

    result = await run_python_in_container(code, timeout=30)

    if result["error"]:
        return json.dumps({"error": result["error"]})

    output_parts = []
    if result["stdout"]:
        output_parts.append(result["stdout"])
    if result["stderr"]:
        output_parts.append(f"[stderr]\n{result['stderr']}")
    if result["exit_code"] != 0:
        output_parts.append(f"[exit_code: {result['exit_code']}]")

    return json.dumps({
        "output": "\n".join(output_parts) if output_parts else "(no output)",
        "exit_code": result["exit_code"],
    }, ensure_ascii=False)


async def execute_search_memory(args: dict[str, Any], user_id: str | None = None) -> str:
    if not user_id:
        return json.dumps({"error": "user_id required"})

    query = args.get("query", "").strip()
    if not query:
        return json.dumps({"error": "query must not be empty"})

    top_k = args.get("top_k", 5)

    from app.services.memory_search import search_memory

    results = await search_memory(user_id, query, top_k=top_k)

    if not results:
        return json.dumps({
            "results": [],
            "message": "未找到相关记忆",
        }, ensure_ascii=False)

    return json.dumps({"results": results}, ensure_ascii=False)


# ── Skill reader tool ──────────────────────────────────────────────────────

async def execute_read_skill(args: dict[str, Any], user_id: str | None = None) -> str:
    from app.services.skill_loader import read_skill_content
    skill = args.get("skill", "")
    file = args.get("file", "SKILL.md")
    try:
        content = read_skill_content(skill, file, user_id=user_id)
        return content
    except (ValueError, FileNotFoundError) as exc:
        return json.dumps({"error": str(exc)})


async def execute_server_tool(tool_name: str, args: dict[str, Any], user_id: str | None = None) -> str:
    if tool_name == "web_search":
        return await execute_web_search(args)
    elif tool_name == "fetch_url":
        return await execute_fetch_url(args)
    elif tool_name == "python_repl":
        return await execute_python_repl(args)
    elif tool_name == "search_memory":
        return await execute_search_memory(args, user_id)
    elif tool_name == "http_request":
        return await execute_http_request(args)
    elif tool_name == "memory_write":
        return await execute_memory_write(args, user_id)
    elif tool_name == "memory_read":
        return await execute_memory_read(args, user_id)
    elif tool_name == "memory_search":
        return await execute_memory_search(args, user_id)
    elif tool_name == "read_skill":
        return await execute_read_skill(args, user_id)
    # Legacy DB-based tools (backward compatibility)
    elif tool_name == "save_memory":
        return await execute_save_memory(args, user_id)
    elif tool_name == "update_memory":
        return await execute_update_memory(args, user_id)
    return json.dumps({"error": f"Unknown server tool: {tool_name}"})


# ── File-based memory tools ────────────────────────────────────────────────

_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _validate_memory_path(path: str) -> str:
    """Validate memory file path (only .md, no traversal)."""
    if not path or not path.endswith('.md'):
        raise ValueError("Only .md files are allowed")
    normalized = os.path.normpath(path)
    if normalized.startswith('..') or '..' + os.sep in normalized or os.path.isabs(normalized):
        raise ValueError("Path traversal not allowed")
    return normalized


def _user_memory_dir(user_id: str) -> str:
    d = os.path.join(settings.MEMORY_FILES_DIR, user_id)
    os.makedirs(d, exist_ok=True)
    return d


async def execute_memory_write(args: dict[str, Any], user_id: str | None) -> str:
    if not user_id:
        return json.dumps({"error": "user_id required"})
    try:
        path = _validate_memory_path(str(args.get("path", "")))
        content = _CTRL_RE.sub("", str(args.get("content", "")))
        fpath = os.path.join(_user_memory_dir(user_id), path)
        os.makedirs(os.path.dirname(fpath), exist_ok=True)
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)

        # Rebuild memory RAG index for MEMORY.md and daily notes
        if path == "MEMORY.md" or re.match(r"^\d{4}-\d{2}-\d{2}\.md$", path):
            try:
                from app.services.memory_search import rebuild_memory_index
                await rebuild_memory_index(user_id, path)
            except Exception:
                pass  # Non-critical: index rebuild failure should not block write

        return json.dumps({"ok": True, "path": path})
    except (ValueError, OSError) as e:
        return json.dumps({"error": str(e)})


async def execute_memory_read(args: dict[str, Any], user_id: str | None) -> str:
    if not user_id:
        return json.dumps({"error": "user_id required"})
    try:
        path = _validate_memory_path(str(args.get("path", "")))
        fpath = os.path.join(_user_memory_dir(user_id), path)
        if not os.path.isfile(fpath):
            return json.dumps({"error": "File not found", "path": path})
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
        return json.dumps({"ok": True, "path": path, "content": content})
    except (ValueError, OSError) as e:
        return json.dumps({"error": str(e)})


async def execute_memory_search(args: dict[str, Any], user_id: str | None) -> str:
    if not user_id:
        return json.dumps({"error": "user_id required"})
    try:
        query = str(args.get("query", "")).strip()
        if not query:
            return json.dumps({"error": "query must not be empty"})

        from app.services.memory_search import search_memory
        results = await search_memory(user_id, query, top_k=10)
        return json.dumps({"ok": True, "results": results}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


# ── Legacy DB-based memory tools (backward compatibility) ──────────────────

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
