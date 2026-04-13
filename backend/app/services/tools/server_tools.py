"""
Server-side tool execution: web_search and http_request.
"""
import json
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


async def execute_server_tool(tool_name: str, args: dict[str, Any]) -> str:
    if tool_name == "web_search":
        return await execute_web_search(args)
    elif tool_name == "http_request":
        return await execute_http_request(args)
    return json.dumps({"error": f"Unknown server tool: {tool_name}"})
