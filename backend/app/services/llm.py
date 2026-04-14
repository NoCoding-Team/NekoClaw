"""
LLM Pipeline service.

Handles:
  - Memory injection into system prompt
  - Skill system prompt selection + tool filtering
  - Mode A (managed) and Mode B (custom key) dispatch
  - Tool routing: server tools execute here, client tools forwarded via WS
  - Sandbox analysis before forwarding client tools
  - Context compression when token count exceeds threshold
"""
import asyncio
import json
import uuid
from typing import Any

from fastapi import WebSocket
from sqlalchemy import select, func

from app.models.base import AsyncSessionLocal
from app.models.message import Message
from app.models.session import Session
from app.models.llm_config import LLMConfig
from app.models.skill import Skill
from app.core.security import decrypt_api_key
from app.services.sandbox import analyze_risk
from app.services.tools.definitions import TOOL_MAP, get_openai_tools
from app.services.tools.server_tools import execute_server_tool
from app.api.ws import send_event, get_pending_tool_future

# Compression threshold: compress when > 70% of context limit is used
COMPRESS_RATIO = 0.70
CLIENT_TOOL_TIMEOUT = 60  # seconds


async def run_llm_pipeline(
    session_id: str,
    user_id: str,
    skill_id: str | None,
    ws: WebSocket,
    allowed_tools_override: list[str] | None = None,
):
    async with AsyncSessionLocal() as db:
        # Load session config
        session = await db.get(Session, session_id)
        active_skill_id = skill_id or (session.skill_id if session else None)

        # Load Skill
        skill = None
        if active_skill_id:
            skill = await db.get(Skill, active_skill_id)

        # Load default LLM config: prefer user's own default, fall back to global default
        result = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id == user_id,
                LLMConfig.is_default == True,
                LLMConfig.deleted_at.is_(None),
            )
        )
        llm_config = result.scalar_one_or_none()

        if not llm_config:
            result = await db.execute(
                select(LLMConfig).where(
                    LLMConfig.owner_id.is_(None),
                    LLMConfig.is_default == True,
                    LLMConfig.deleted_at.is_(None),
                )
            )
            llm_config = result.scalar_one_or_none()

        # Load message history
        msgs_result = await db.execute(
            select(Message)
            .where(Message.session_id == session_id, Message.deleted_at.is_(None))
            .order_by(Message.created_at.asc())
        )
        history = msgs_result.scalars().all()

    # Build messages list
    system_prompt = await _build_system_prompt(user_id, skill)
    messages = [{"role": "system", "content": system_prompt}]
    total_tokens = sum(m.token_count for m in history)

    # Context compression check
    context_limit = llm_config.context_limit if llm_config else 128000
    if total_tokens > context_limit * COMPRESS_RATIO and len(history) > 10:
        history = await _compress_history(session_id, history, context_limit, llm_config, ws)

    for m in history:
        entry: dict[str, Any] = {"role": m.role, "content": m.content or ""}
        if m.tool_calls:
            entry["tool_calls"] = m.tool_calls
        messages.append(entry)

    # Determine allowed tools: skill > client override > all
    allowed_tools = skill.allowed_tools if skill else allowed_tools_override
    tools = get_openai_tools(allowed_tools)

    # Agentic loop
    while True:
        response_text, tool_calls_raw = await _call_llm(messages, tools, llm_config, ws)

        if not tool_calls_raw:
            # Final text response
            await send_event(ws, "cat_state", {"state": "success"})
            await _persist_message(session_id, "assistant", response_text, None)
            break

        # Persist assistant message with tool calls
        await _persist_message(session_id, "assistant", response_text, tool_calls_raw)
        messages.append({"role": "assistant", "content": response_text, "tool_calls": tool_calls_raw})

        # Process each tool call
        tool_results = []
        for tc in tool_calls_raw:
            call_id = tc["id"]
            tool_name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"])
            except Exception:
                args = {}

            tool_def = TOOL_MAP.get(tool_name)
            if not tool_def:
                result_content = json.dumps({"error": f"Unknown tool: {tool_name}"})
                tool_results.append({"tool_call_id": call_id, "content": result_content})
                continue

            # Sandbox check
            risk_level, reason = analyze_risk(tool_name, args)
            if risk_level == "DENY":
                deny_msg = f"Tool call blocked by sandbox: {reason}"
                await send_event(ws, "tool_denied", {"call_id": call_id, "reason": deny_msg})
                result_content = json.dumps({"error": deny_msg})
                tool_results.append({"tool_call_id": call_id, "content": result_content})
                continue

            if tool_def["executor"] == "server":
                await send_event(ws, "cat_state", {"state": "working"})
                result_content = await execute_server_tool(tool_name, args)
            else:
                # Forward to PC client
                await send_event(ws, "tool_call", {
                    "call_id": call_id,
                    "tool": tool_name,
                    "args": args,
                    "risk_level": risk_level,
                    "reason": reason,
                })
                await send_event(ws, "cat_state", {"state": "working"})
                try:
                    future = await get_pending_tool_future(call_id)
                    client_result = await asyncio.wait_for(future, timeout=CLIENT_TOOL_TIMEOUT)
                    result_content = json.dumps(client_result.get("result", {}))
                    if client_result.get("error"):
                        result_content = json.dumps({"error": client_result["error"]})
                        await send_event(ws, "tool_error", {"call_id": call_id, "error": client_result["error"]})
                except asyncio.TimeoutError:
                    result_content = json.dumps({"error": "Client tool execution timed out"})
                    await send_event(ws, "tool_error", {"call_id": call_id, "error": "Timeout"})

            tool_results.append({"tool_call_id": call_id, "content": result_content})

        # Append tool results to messages for next iteration
        for tr in tool_results:
            messages.append({"role": "tool", "tool_call_id": tr["tool_call_id"], "content": tr["content"]})
            await _persist_message(session_id, "tool", tr["content"], None)


async def _build_system_prompt(user_id: str, skill: Any | None) -> str:
    if skill:
        base = skill.system_prompt
    else:
        base = (
            "你是一只聪明可爱的猫咪助手，叫做 NekoClaw。请用中文回复用户。\n\n"
            "## 工具执行环境说明\n"
            "你可以使用以下工具直接完成任务，**无需让用户手动操作**：\n"
            "- `shell_exec`、`file_read`、`file_write`、`file_list`、`file_delete`、"
            "`browser_navigate`、`browser_screenshot`、`browser_click`、`browser_type`：\n"
            "  这些工具在**用户的本地电脑**上执行，通过桌面客户端的 IPC 桥接运行。"
            "你可以直接调用它们来操作用户的本机文件系统、终端命令、浏览器等，无需用户自己手动操作。\n"
            "- `web_search`、`http_request`：在服务端执行，用于联网搜索和接口请求。\n\n"
            "当用户请求需要使用工具时，**直接调用对应工具**，不要告诉用户去手动操作。"
        )

    # Inject memory
    memory_context = await _load_memory(user_id)
    if memory_context:
        base += f"\n\n## 关于用户的记忆\n{memory_context}"
    return base


async def _load_memory(user_id: str) -> str:
    from app.models.memory import Memory
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Memory)
            .where(Memory.user_id == user_id, Memory.deleted_at.is_(None))
            .order_by(Memory.created_at.desc())
            .limit(50)
        )
        entries = result.scalars().all()
    if not entries:
        return ""
    lines = [f"[{e.category}] {e.content}" for e in entries]
    return "\n".join(lines)


async def _call_llm(
    messages: list,
    tools: list,
    llm_config: Any | None,
    ws: WebSocket,
) -> tuple[str, list | None]:
    """Call LLM and stream tokens via WebSocket. Returns (text, tool_calls)."""
    if not llm_config:
        # No LLM configured
        await send_event(ws, "llm_token", {"token": "⚠️ 没有配置 LLM，请管理员在服务端添加 LLM 配置。"})
        await send_event(ws, "llm_done", {"message_id": str(uuid.uuid4())})
        return "⚠️ 没有配置 LLM", None

    api_key = decrypt_api_key(llm_config.api_key_encrypted)
    base_url = llm_config.base_url

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    full_text = ""
    tool_calls_accumulator: dict[int, dict] = {}

    stream = await client.chat.completions.create(
        model=llm_config.model,
        messages=messages,
        tools=tools if tools else None,
        temperature=getattr(llm_config, 'temperature', 0.7),
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if not delta:
            continue

        if delta.content:
            full_text += delta.content
            await send_event(ws, "llm_token", {"token": delta.content})

        if delta.tool_calls:
            for tc in delta.tool_calls:
                idx = tc.index
                if idx not in tool_calls_accumulator:
                    tool_calls_accumulator[idx] = {
                        "id": tc.id or "",
                        "type": "function",
                        "function": {"name": "", "arguments": ""},
                    }
                if tc.id:
                    tool_calls_accumulator[idx]["id"] = tc.id
                if tc.function:
                    if tc.function.name:
                        tool_calls_accumulator[idx]["function"]["name"] += tc.function.name
                    if tc.function.arguments:
                        tool_calls_accumulator[idx]["function"]["arguments"] += tc.function.arguments

    tool_calls = list(tool_calls_accumulator.values()) if tool_calls_accumulator else None
    msg_id = str(uuid.uuid4())
    await send_event(ws, "llm_done", {"message_id": msg_id})
    return full_text, tool_calls


async def _persist_message(session_id: str, role: str, content: str | None, tool_calls: list | None):
    async with AsyncSessionLocal() as db:
        msg = Message(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role=role,
            content=content,
            tool_calls=tool_calls,
        )
        db.add(msg)
        await db.commit()


async def _compress_history(
    session_id: str,
    history: list,
    context_limit: int,
    llm_config: Any | None,
    ws: WebSocket,
) -> list:
    """Compress early messages into a summary. Returns new history list."""
    # Keep the most recent 20 messages, compress the rest
    to_compress = history[:-20]
    to_keep = history[-20:]

    if not to_compress or not llm_config:
        return history

    conversation_text = "\n".join(
        f"{m.role}: {m.content or ''}" for m in to_compress
    )
    summary_prompt = [
        {"role": "system", "content": "请将以下对话历史压缩为简洁摘要，保留关键信息和决策："},
        {"role": "user", "content": conversation_text},
    ]

    try:
        from openai import AsyncOpenAI
        api_key = decrypt_api_key(llm_config.api_key_encrypted)
        client = AsyncOpenAI(api_key=api_key, base_url=llm_config.base_url)
        resp = await client.chat.completions.create(
            model=llm_config.model,
            messages=summary_prompt,
            stream=False,
        )
        summary = resp.choices[0].message.content or "（历史对话摘要）"
    except Exception:
        summary = "（历史对话已压缩）"

    # Persist summary as a system message
    async with AsyncSessionLocal() as db:
        for m in to_compress:
            m.deleted_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
        summary_msg = Message(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role="system",
            content=f"[对话历史摘要]\n{summary}",
        )
        db.add(summary_msg)
        await db.commit()

    return [summary_msg] + list(to_keep)
