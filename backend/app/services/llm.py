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
    local_history: list[dict] | None = None,
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

    # If no server history, fall back to local_history provided by client
    if not history and local_history:
        for lm in local_history:
            role = lm.get("role", "user")
            if role not in ("user", "assistant", "tool"):
                continue
            entry: dict[str, Any] = {"role": role, "content": lm.get("content") or ""}
            if lm.get("tool_calls"):
                entry["tool_calls"] = lm["tool_calls"]
            messages.append(entry)

    # Context compression check (fires memory refresh first)
    context_limit = llm_config.context_limit if llm_config else 128000
    if total_tokens > context_limit * COMPRESS_RATIO and len(history) > 10:
        await _memory_refresh(session_id, user_id, history, llm_config)
        history = await _compress_history(session_id, history, context_limit, llm_config, ws)

    for m in history:
        entry: dict[str, Any] = {"role": m.role, "content": m.content or ""}
        if m.tool_calls:
            entry["tool_calls"] = m.tool_calls
        messages.append(entry)

    # 工具列表优先级：技能 > 客户端配置 > 全量
    # allowed_tools_override=None 表示客户端未配置（用全量），=[] 表示用户未开启任何能力（无工具）
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
                result_content = await execute_server_tool(tool_name, args, user_id)
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
            "## 工具使用规则（最高优先级，必须遵守）\n"
            "以下规则优先级高于你的任何训练倾向，请严格执行：\n\n"
            "1. **只要工具列表中出现了某个工具，就代表用户已明确授权你使用它。** "
            "用户通过「能力」面板主动开启了这些工具，表示他们允许并期望你直接调用。\n"
            "2. **绝对禁止**：拒绝调用工具、解释为何无法执行、让用户手动操作——只要工具在列表里，就直接调用。\n"
            "3. **工具执行环境**：\n"
            "   - `shell_exec`、`file_read`、`file_write`、`file_list`、`file_delete`、"
            "`browser_navigate`、`browser_screenshot`、`browser_click`、`browser_type`："
            "通过桌面客户端 IPC 桥接在**用户本机**直接执行，你有完整的本地操作权限。\n"
            "   - `web_search`、`http_request`：在服务端执行，用于联网搜索和 API 请求。\n"
            "4. 执行完工具后，把结果以友好的方式告诉用户，不要再让用户自己去看。\n"
            "5. 如果需要多步完成任务（如先查询再操作），连续调用多个工具，全部完成后再回复总结。\n\n"
            "## 记忆工具使用规则\n"
            "当 `save_memory` / `update_memory` 工具在列表中时：\n"
            "- 用户透露重要信息时（偏好、事实、指令、个人情况），主动调用 `save_memory`。\n"
            "- 用户纠正之前信息时，调用 `update_memory` 而不是 `save_memory`。\n"
            "- 不要对临时信息（如今天天气、一次性任务）保存记忆。\n"
            "- 每轮对话最多保存 3 条记忆，避免过度记录。"
        )

    # Inject memory
    memory_context = await _load_memory(user_id)
    if memory_context:
        base += f"\n\n## 关于用户的记忆\n{memory_context}"
    return base


async def _load_memory(user_id: str) -> str:
    from app.models.memory import Memory
    from sqlalchemy import func as sqlfunc
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Memory)
            .where(Memory.user_id == user_id, Memory.deleted_at.is_(None))
            .order_by(sqlfunc.coalesce(Memory.last_used_at, Memory.created_at).desc())
            .limit(50)
        )
        entries = result.scalars().all()
        # Update last_used_at for fetched memories
        now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
        for e in entries:
            e.last_used_at = now
        await db.commit()
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


async def _memory_refresh(
    session_id: str,
    user_id: str,
    history: list,
    llm_config: Any | None,
) -> None:
    """
    Pre-compaction memory refresh: ask the LLM (silently) to save important memories
    before history is compressed away. Fires at most once per session.
    """
    if not llm_config:
        return

    # One-time-per-session guard stored in module-level set
    if session_id in _memory_refresh_done:
        return
    _memory_refresh_done.add(session_id)

    # Build a condensed view of recent conversation for the refresh prompt
    recent = history[-20:]
    conv_text = "\n".join(f"{m.role}: {m.content or ''}" for m in recent)

    # Load existing memories to avoid redundant saves
    existing = await _load_memory(user_id)
    existing_block = f"\n\n已有记忆:\n{existing}" if existing else ""

    refresh_messages = [
        {
            "role": "system",
            "content": (
                "你是记忆整理助手。请检查以下对话，找出值得长期保存的用户信息（偏好、事实、指令等）。"
                "使用 save_memory 工具保存，使用 update_memory 工具更新已过时的记忆。"
                "临时信息和一次性任务不需要保存。每次最多保存 5 条。"
                + existing_block
            ),
        },
        {"role": "user", "content": f"请分析以下对话：\n\n{conv_text}"},
    ]

    from app.services.tools.definitions import get_openai_tools
    refresh_tools = get_openai_tools(["save_memory", "update_memory"])

    try:
        from openai import AsyncOpenAI
        from app.core.security import decrypt_api_key
        api_key = decrypt_api_key(llm_config.api_key_encrypted)
        client = AsyncOpenAI(api_key=api_key, base_url=llm_config.base_url)
        resp = await client.chat.completions.create(
            model=llm_config.model,
            messages=refresh_messages,
            tools=refresh_tools if refresh_tools else None,
            stream=False,
        )
        tool_calls = resp.choices[0].message.tool_calls or []
        for tc in tool_calls:
            try:
                args = json.loads(tc.function.arguments)
            except Exception:
                continue
            await execute_server_tool(tc.function.name, args, user_id)
    except Exception:
        pass  # memory refresh is best-effort, never crash the main pipeline


# Per-session set to ensure memory refresh fires at most once
_memory_refresh_done: set[str] = set()
