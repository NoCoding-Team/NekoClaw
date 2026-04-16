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
import math
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

# 工具输出截断阈值
MAX_TOOL_RESULT_CHARS = 8000


def estimate_tokens(text: str) -> int:
    """Estimate token count from text length (Chinese/English mixed heuristic)."""
    return math.ceil(len(text) * 0.6)


def _truncate_tool_result(result: str) -> str:
    """Truncate a tool result for LLM context (keeps head + tail)."""
    if len(result) <= MAX_TOOL_RESULT_CHARS:
        return result
    return result[:6000] + "\n...[输出过长已截断]...\n" + result[-1500:]


def _soft_trim(content: str) -> str:
    if len(content) <= 500:
        return content
    return content[:300] + "\n...[已裁剪]...\n" + content[-200:]


def _prune_tool_results(messages: list[dict]) -> list[dict]:
    """Prune tool results by distance from current round (3-tier strategy).

    Recent 3 rounds: keep (soft-trim if > 4000 chars)
    4-8 rounds: soft trim
    >8 rounds: hard clear
    """
    max_tool_result_tokens = 4000
    # Assign round distances (walk backwards, each assistant msg starts new round)
    round_index = [0] * len(messages)
    current_round = 0
    for i in range(len(messages) - 1, -1, -1):
        round_index[i] = current_round
        if messages[i].get("role") == "assistant":
            current_round += 1

    result = []
    for i, m in enumerate(messages):
        if m.get("role") != "tool":
            result.append(m)
            continue
        distance = round_index[i]
        content = m.get("content", "")
        if distance < 3:
            if len(content) > max_tool_result_tokens:
                result.append({**m, "content": _soft_trim(content)})
            else:
                result.append(m)
        elif distance < 8:
            result.append({**m, "content": _soft_trim(content)})
        else:
            result.append({**m, "content": "[工具输出已省略]"})
    return result


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
            .order_by(Message.seq.asc(), Message.created_at.asc())
        )
        history = msgs_result.scalars().all()

    # Build messages list
    system_prompt = await _build_system_prompt(user_id, skill)
    messages = [{"role": "system", "content": system_prompt}]
    total_tokens = sum(m.token_count or estimate_tokens(m.content or '') for m in history)

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

    # Count user turns for periodic refresh
    user_turn_count = sum(1 for m in history if m.role == "user") if history else sum(1 for m in (local_history or []) if m.get("role") == "user")

    # Periodic memory refresh (every 15 user turns)
    if user_turn_count > 0 and user_turn_count % _REFRESH_INTERVAL == 0:
        if _can_refresh(session_id, user_turn_count):
            await _memory_refresh(session_id, user_id, history, llm_config)

    if total_tokens > context_limit * COMPRESS_RATIO and len(history) > 10:
        await _memory_refresh(session_id, user_id, history, llm_config)
        history = await _compress_history(session_id, history, context_limit, llm_config, ws)

    for m in history:
        if m.role == "tool":
            # Reconstruct OpenAI-compatible tool result message
            tcid = m.tool_call_id
            if not tcid and m.tool_calls and len(m.tool_calls) > 0:
                tcid = m.tool_calls[0].get("callId", "")
            entry: dict[str, Any] = {"role": "tool", "tool_call_id": tcid or "", "content": m.content or ""}
        else:
            entry = {"role": m.role, "content": m.content or ""}
            if m.tool_calls:
                entry["tool_calls"] = m.tool_calls
        messages.append(entry)

    # 工具列表优先级：技能 > 客户端配置 > 全量
    # allowed_tools_override=None 表示客户端未配置（用全量），=[] 表示用户未开启任何能力（无工具）
    allowed_tools = skill.allowed_tools if skill else allowed_tools_override
    tools = get_openai_tools(allowed_tools)

    # Session Pruning: trim old tool results to save context budget
    messages = _prune_tool_results(messages)

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
                await send_event(ws, "server_tool_call", {
                    "call_id": call_id,
                    "tool": tool_name,
                    "args": args,
                    "risk_level": risk_level,
                })
                await send_event(ws, "cat_state", {"state": "working"})
                result_content = await execute_server_tool(tool_name, args, user_id)
                await send_event(ws, "server_tool_done", {
                    "call_id": call_id,
                    "result": result_content[:300],
                })
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
        for tc, tr in zip(tool_calls_raw, tool_results):
            call_id = tc["id"]
            tool_name = tc["function"]["name"]
            try:
                parsed_args = json.loads(tc["function"]["arguments"] or "{}")
            except Exception:
                parsed_args = {}
            risk_level, _ = analyze_risk(tool_name, parsed_args)
            result_content = tr["content"]
            try:
                _parsed = json.loads(result_content)
                status = "error" if (isinstance(_parsed, dict) and _parsed.get("error")) else "done"
            except Exception:
                status = "done"
            # Build frontend-compatible ToolCall card so it survives server reload
            tool_call_card = [{
                "callId": call_id,
                "tool": tool_name,
                "args": parsed_args,
                "riskLevel": risk_level,
                "status": status,
                "result": result_content[:2000],
            }]
            messages.append({"role": "tool", "tool_call_id": call_id, "content": _truncate_tool_result(result_content)})
            await _persist_message(session_id, "tool", result_content, tool_call_card, tool_call_id=call_id)

        # Mid-loop context safety check
        mid_tokens = sum(estimate_tokens(m.get("content", "") or "") for m in messages)
        if mid_tokens > context_limit * 0.85:
            messages = _prune_tool_results(messages)
            after_prune = sum(estimate_tokens(m.get("content", "") or "") for m in messages)
            if after_prune > context_limit * 0.90:
                # Emergency: keep system + last 20 messages
                system_msgs = [m for m in messages if m.get("role") == "system"]
                non_system = [m for m in messages if m.get("role") != "system"]
                if len(non_system) > 20:
                    messages = system_msgs + non_system[-20:]


_TOOL_RULES = (
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
    "   - `memory_write`、`memory_read`、`memory_search`：在服务端读写用户记忆文件。\n"
    "4. 执行完工具后，把结果以友好的方式告诉用户，不要再让用户自己去看。\n"
    "5. 如果需要多步完成任务（如先查询再操作），连续调用多个工具，全部完成后再回复总结。\n\n"
    "## 记忆管理规则\n"
    "你拥有持久记忆系统，通过 memory_write / memory_read / memory_search 工具管理：\n"
    "- **MEMORY.md**：长期记忆——用户偏好、关键事实、重要决策、个人信息。\n"
    "- **YYYY-MM-DD.md**（如 2026-04-16.md）：每日笔记——当天对话要点、讨论话题、结论。\n\n"
    "### 何时写入记忆（发现以下情况时立即执行）\n"
    "- 用户透露偏好（语言、格式、工具选择、沟通风格等）→ 写入 MEMORY.md\n"
    "- 用户提到关于自己的重要事实（职业、项目、技术栈、习惯等）→ 写入 MEMORY.md\n"
    "- 用户做出重要决策或给出关键指令 → 写入 MEMORY.md\n"
    "- 用户纠正之前的错误信息 → 读取并更新 MEMORY.md 对应内容\n"
    "- 对话产生有价值的结论、方案、要点 → 写入当日 YYYY-MM-DD.md\n"
    "- 用户明确要求"记住..."、"下次..." → 写入 MEMORY.md\n\n"
    "### 写入流程\n"
    "1. 先 memory_read 读取目标文件已有内容\n"
    "2. 在已有内容基础上追加新条目（不要覆写已有内容）\n"
    "3. 用 memory_write 写回完整内容\n\n"
    "### 不需要写入的内容\n"
    "- 当前任务的临时中间步骤\n"
    "- 大段代码或文件内容原文"
)

_DEFAULT_PERSONA = "你是一只聪明可爱的猫咪助手，叫做 NekoClaw。请用中文回复用户。"


async def _build_system_prompt(user_id: str, skill: Any | None, client_system_prompt: str | None = None) -> str:
    if skill:
        base = skill.system_prompt
    elif client_system_prompt and client_system_prompt.strip():
        # Client has personalization — use it as persona, then append tool rules
        base = client_system_prompt.strip() + "\n\n" + _TOOL_RULES
    else:
        base = _DEFAULT_PERSONA + "\n\n" + _TOOL_RULES

    # Inject memory from Markdown files (Mode A: server-side)
    memory_context = await _load_memory(user_id)
    if memory_context:
        base += f"\n\n## 关于用户的记忆\n{memory_context}"
    return base


async def _load_memory(user_id: str) -> str:
    """Load memory from Markdown files for Mode A (server-side).
    Falls back to DB-based memory if no files exist."""
    import os
    from app.core.config import settings
    from datetime import date, timedelta
    user_dir = os.path.join(settings.MEMORY_FILES_DIR, user_id)

    parts = []

    # Read MEMORY.md (long-term memory)
    memory_md = os.path.join(user_dir, 'MEMORY.md')
    if os.path.isfile(memory_md):
        with open(memory_md, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        if content:
            # Truncate to 4000 chars
            if len(content) > 4000:
                content = content[:4000] + '\n...(已截断)'
            parts.append(content)

    # Read today + yesterday daily notes
    today = date.today()
    for d in [today, today - timedelta(days=1)]:
        daily_path = os.path.join(user_dir, f'{d.isoformat()}.md')
        if os.path.isfile(daily_path):
            with open(daily_path, 'r', encoding='utf-8') as f:
                text = f.read().strip()
            if text:
                parts.append(f"### {d.isoformat()} 笔记\n{text}")

    if parts:
        return '\n\n'.join(parts)

    # Fallback: DB-based memory (legacy)
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


async def _next_seq(db, session_id: str) -> int:
    """Atomically get the next sequence number for a session."""
    result = await db.execute(
        select(func.coalesce(func.max(Message.seq), 0)).where(Message.session_id == session_id)
    )
    return (result.scalar() or 0) + 1


async def _persist_message(
    session_id: str, role: str, content: str | None, tool_calls: list | None,
    tool_call_id: str | None = None,
):
    async with AsyncSessionLocal() as db:
        seq = await _next_seq(db, session_id)
        msg = Message(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role=role,
            content=content,
            tool_calls=tool_calls,
            tool_call_id=tool_call_id,
            seq=seq,
            token_count=estimate_tokens(content or ''),
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
    before history is compressed away. Uses turn-based interval protection.
    """
    if not llm_config:
        return

    # Count user turns from history for interval protection
    user_turn_count = sum(1 for m in history if hasattr(m, 'role') and m.role == 'user') if history else 0
    if not _can_refresh(session_id, user_turn_count):
        return
    _mark_refresh_done(session_id, user_turn_count)

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
                "你是记忆整理助手。请检查以下对话，找出值得长期保存的用户信息（偏好、事实、指令等）。\n"
                "使用 memory_read 读取 MEMORY.md，追加新条目后用 memory_write 写回。\n"
                "临时信息和一次性任务不需要保存。每次最多操作 5 次工具调用。"
                + existing_block
            ),
        },
        {"role": "user", "content": f"请分析以下对话：\n\n{conv_text}"},
    ]

    from app.services.tools.definitions import get_openai_tools
    refresh_tools = get_openai_tools(["memory_read", "memory_write", "memory_search"])

    try:
        from openai import AsyncOpenAI
        from app.core.security import decrypt_api_key
        api_key = decrypt_api_key(llm_config.api_key_encrypted)
        client = AsyncOpenAI(api_key=api_key, base_url=llm_config.base_url)

        messages = refresh_messages
        for _ in range(3):  # max 3 rounds of tool calls
            resp = await client.chat.completions.create(
                model=llm_config.model,
                messages=messages,
                tools=refresh_tools if refresh_tools else None,
                stream=False,
            )
            choice = resp.choices[0]
            tool_calls = choice.message.tool_calls or []
            if not tool_calls:
                break
            # Append assistant message with tool calls
            messages.append(choice.message.model_dump())
            for tc in tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except Exception:
                    continue
                result = await execute_server_tool(tc.function.name, args, user_id)
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
    except Exception:
        pass  # memory refresh is best-effort, never crash the main pipeline


# Per-session turn-based refresh interval protection
_REFRESH_INTERVAL = 15   # trigger every N user turns
_REFRESH_MIN_GAP = 5     # minimum turns between refreshes
_last_refresh_turn: dict[str, int] = {}


def _can_refresh(session_id: str, current_turn: int) -> bool:
    """Check if refresh is allowed (minimum gap protection)."""
    last_turn = _last_refresh_turn.get(session_id, -_REFRESH_MIN_GAP)
    return (current_turn - last_turn) >= _REFRESH_MIN_GAP


def _mark_refresh_done(session_id: str, current_turn: int) -> None:
    """Mark that a refresh was performed at the given turn."""
    _last_refresh_turn[session_id] = current_turn
