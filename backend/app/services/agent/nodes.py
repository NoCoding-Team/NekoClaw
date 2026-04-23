"""
LangGraph node functions for the NekoClaw agent.

Graph topology:
    prepare → llm_call → should_continue → tools → llm_call (loop)
                                        ↘ finalize → END
"""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

from langchain_core.messages import AIMessage, SystemMessage

from app.api.ws import get_pending_tool_future, send_event
from app.models.base import AsyncSessionLocal
from app.models.message import Message
from app.models.llm_config import LLMConfig
from app.models.session import Session
from app.services.agent.callbacks import WebSocketStreamHandler
from app.services.agent.context import (
    build_system_prompt,
    compress_history,
    estimate_tokens,
    memory_refresh,
    prune_tool_results,
    should_run_periodic_refresh,
    to_lc_message,
    _truncate_tool_result,
)
from app.services.agent.compaction import (
    count_message_tokens,
    should_compress,
    compress_messages,
    get_encoder,
)
from app.services.agent.provider import get_chat_model
from app.services.agent.state import AgentState
from app.services.agent.tools import get_tools
from app.services.sandbox import analyze_risk
from app.services.tools.definitions import TOOL_MAP
from app.services.tools.server_tools import execute_server_tool
from sqlalchemy import func, select

CLIENT_TOOL_TIMEOUT = 60  # seconds


# ── Helpers ─────────────────────────────────────────────────────────────────


async def _next_seq(db: Any, session_id: str) -> int:
    result = await db.execute(
        select(func.coalesce(func.max(Message.seq), 0)).where(
            Message.session_id == session_id
        )
    )
    return (result.scalar() or 0) + 1


async def _persist_message(
    session_id: str,
    role: str,
    content: str | None,
    tool_calls: list | None,
    tool_call_id: str | None = None,
) -> None:
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
            token_count=estimate_tokens(content or ""),
        )
        db.add(msg)
        await db.commit()


def _lc_tool_calls_to_openai(tool_calls: list[dict]) -> list[dict]:
    """Convert LangChain AIMessage.tool_calls to OpenAI format for DB storage."""
    return [
        {
            "id": tc.get("id", ""),
            "type": "function",
            "function": {
                "name": tc.get("name", ""),
                "arguments": json.dumps(tc.get("args", {})),
            },
        }
        for tc in tool_calls
    ]


# ── Nodes ────────────────────────────────────────────────────────────────────


async def prepare(state: AgentState) -> dict:
    """Load session data, build initial messages, run memory refresh if due."""
    session_id = state["session_id"]
    user_id = state["user_id"]
    custom_llm_cfg = state.get("custom_llm_config")

    async with AsyncSessionLocal() as db:
        # Session
        session = await db.get(Session, session_id)

        # LLM config: custom (from client) > user-owned default > global default
        llm_config = None
        if custom_llm_cfg:
            # Build a duck-typed config object from client-supplied data.
            # The api_key is passed plain-text and encrypted here so provider.py
            # can decrypt it with decrypt_api_key as usual.
            from app.core.security import encrypt_api_key as _enc

            class _CustomConfig:
                provider = custom_llm_cfg.get("provider", "openai")
                model = custom_llm_cfg.get("model", "")
                base_url = custom_llm_cfg.get("base_url") or None
                temperature = float(custom_llm_cfg.get("temperature", 0.7))
                context_limit = int(custom_llm_cfg.get("context_limit", 128000))
                api_key_encrypted = _enc(custom_llm_cfg.get("api_key", ""))

            llm_config = _CustomConfig()
        else:
            result = await db.execute(
                select(LLMConfig).where(
                    LLMConfig.owner_id == user_id,
                    LLMConfig.is_default.is_(True),
                    LLMConfig.deleted_at.is_(None),
                )
            )
            llm_config = result.scalar_one_or_none()

            if not llm_config:
                result = await db.execute(
                    select(LLMConfig).where(
                        LLMConfig.owner_id.is_(None),
                        LLMConfig.is_default.is_(True),
                        LLMConfig.deleted_at.is_(None),
                    )
                )
                llm_config = result.scalar_one_or_none()

        # Message history
        msgs_result = await db.execute(
            select(Message)
            .where(Message.session_id == session_id, Message.deleted_at.is_(None))
            .order_by(Message.seq.asc(), Message.created_at.asc())
        )
        history = list(msgs_result.scalars().all())

        context_limit = llm_config.context_limit if llm_config else 128000

        # Build messages for LangGraph state
        allowed_tools = state.get("allowed_tools")

        # Construct query_hint for memory RAG: session title + last user message
        query_hint_parts: list[str] = []
        if session and session.title:
            query_hint_parts.append(session.title)
        if history:
            for m in reversed(history):
                if m.role == "user" and m.content:
                    query_hint_parts.append(m.content[:200])
                    break
        query_hint = " ".join(query_hint_parts)

        system_prompt = await build_system_prompt(user_id, allowed_tools, db, query_hint=query_hint)
    messages = [SystemMessage(content=system_prompt)]

    user_turn_count = sum(1 for m in history if m.role == "user")

    # Periodic memory refresh
    if should_run_periodic_refresh(session_id, user_turn_count):
        await memory_refresh(session_id, user_id, history, llm_config)

    # Context compression (tiktoken-based 50% threshold)
    model_name = getattr(llm_config, "model", "") if llm_config else ""
    system_tokens = count_message_tokens([SystemMessage(content=system_prompt)], model_name)
    if should_compress(history, context_limit, system_tokens, model_name) and len(history) > 10:
        history = await compress_messages(history, llm_config, session_id, user_id)

    for m in history:
        messages.append(to_lc_message(m))

    # Initial tool-result pruning
    messages = prune_tool_results(messages)

    return {
        "messages": messages,
        "llm_config": llm_config,
        "context_limit": context_limit,
        "user_turn_count": user_turn_count,
    }


async def llm_call(state: AgentState) -> dict:
    """Call the LLM with the current message history, streaming tokens via WebSocket."""
    ws = state["ws"]
    llm_config = state["llm_config"]

    if not llm_config:
        err = "⚠️ 没有配置 LLM，请管理员在服务端添加 LLM 配置。"
        await send_event(ws, "llm_token", {"token": err})
        await send_event(ws, "llm_done", {"message_id": str(uuid.uuid4())})
        return {"messages": [AIMessage(content=err)]}

    context_limit = state["context_limit"]
    messages = list(state["messages"])

    # Mid-loop context safety check (also runs on first call, harmlessly)
    tokens = sum(
        estimate_tokens(m.content if isinstance(m.content, str) else "")
        for m in messages
    )
    if tokens > context_limit * 0.85:
        messages = prune_tool_results(messages)
        after = sum(
            estimate_tokens(m.content if isinstance(m.content, str) else "")
            for m in messages
        )
        if after > context_limit * 0.90:
            # Emergency: keep system messages + last 20
            system_msgs = [m for m in messages if isinstance(m, SystemMessage)]
            non_system = [m for m in messages if not isinstance(m, SystemMessage)]
            messages = system_msgs + non_system[-20:]

    # Resolve tools
    allowed = state.get("allowed_tools")
    tools = get_tools(allowed, ws, state["user_id"])

    # Build model
    model = get_chat_model(llm_config)
    if tools:
        model = model.bind_tools(tools)

    # Stream with WebSocket callback — manual retry with friendly progress messages
    handler = WebSocketStreamHandler(ws)
    _MAX_ATTEMPTS = 3
    _RETRY_MSG = "网络波动，正在重试中，请小主人稍等片刻☆*: .｡. o(≧▽≦)o .｡.:*☆\n"
    ai_message = None
    last_exc: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        if attempt > 0:
            wait_secs = 2 ** attempt  # 2s, 4s
            await asyncio.sleep(wait_secs)
        try:
            ai_message = await model.ainvoke(messages, config={"callbacks": [handler]})
            last_exc = None
            break
        except Exception as exc:
            last_exc = exc
            if attempt == 0:
                # 只在第一次失败时推送提示，后续重试静默等待
                await send_event(ws, "llm_token", {"token": _RETRY_MSG})

    if last_exc is not None:
        err_msg = "小主人，我已经很努力很努力的重试了，但还是失败了，真的非常抱歉(;´༎ຶД༎ຶ`)\n"
        await send_event(ws, "llm_token", {"token": err_msg})
        await send_event(ws, "llm_done", {"message_id": str(uuid.uuid4()), "has_tool_calls": False})
        return {"messages": [AIMessage(content=err_msg)]}

    has_tc = bool(getattr(ai_message, "tool_calls", None))
    await send_event(ws, "llm_done", {"message_id": str(uuid.uuid4()), "has_tool_calls": has_tc})
    return {"messages": [ai_message]}



async def tools_node(state: AgentState) -> dict:
    """Execute tool calls from the last AIMessage, bridge client tools via WS."""
    from langchain_core.messages import ToolMessage

    ai_message: AIMessage = state["messages"][-1]  # type: ignore[assignment]
    ws = state["ws"]
    user_id = state["user_id"]
    session_id = state["session_id"]

    # Persist the assistant message (with tool calls) before executing tools
    await _persist_message(
        session_id=session_id,
        role="assistant",
        content=ai_message.content if isinstance(ai_message.content, str) else "",
        tool_calls=_lc_tool_calls_to_openai(ai_message.tool_calls),
    )

    tool_messages: list[ToolMessage] = []

    for tool_call in ai_message.tool_calls:
        call_id: str = tool_call.get("id") or f"tc_{uuid.uuid4().hex[:12]}"
        tool_name: str = tool_call["name"]
        args: dict = tool_call.get("args", {})

        # ── Sandbox check ──────────────────────────────────────────────
        risk_level, reason = analyze_risk(tool_name, args)
        if risk_level == "DENY":
            deny_msg = f"Tool call blocked by sandbox: {reason}"
            await send_event(ws, "tool_denied", {"call_id": call_id, "reason": deny_msg})
            result_content = json.dumps({"error": deny_msg})
            tool_messages.append(ToolMessage(content=result_content, tool_call_id=call_id))
            await _persist_message(
                session_id, "tool", result_content,
                [{"callId": call_id, "tool": tool_name, "args": args,
                  "riskLevel": risk_level, "status": "error", "result": result_content[:2000]}],
                tool_call_id=call_id,
            )
            continue

        tool_def = TOOL_MAP.get(tool_name)
        if not tool_def:
            result_content = json.dumps({"error": f"Unknown tool: {tool_name}"})
            tool_messages.append(ToolMessage(content=result_content, tool_call_id=call_id))
            continue

        # ── Server tool ────────────────────────────────────────────────
        if tool_def["executor"] == "server":
            await send_event(ws, "server_tool_call", {
                "call_id": call_id,
                "tool": tool_name,
                "args": args,
                "risk_level": risk_level,
            })
            await send_event(ws, "cat_state", {"state": "working"})
            raw_result = await execute_server_tool(tool_name, args, user_id)
            result_content = _truncate_tool_result(raw_result)
            await send_event(ws, "server_tool_done", {
                "call_id": call_id,
                "result": result_content[:300],
            })

        # ── Client tool (WebSocket bridge) ─────────────────────────────
        else:
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
                if client_result.get("error"):
                    result_content = json.dumps({"error": client_result["error"]})
                    await send_event(ws, "tool_error", {
                        "call_id": call_id,
                        "error": client_result["error"],
                    })
                else:
                    result_content = _truncate_tool_result(
                        json.dumps(client_result.get("result", {}))
                    )
            except asyncio.TimeoutError:
                result_content = json.dumps({"error": "Client tool execution timed out"})
                await send_event(ws, "tool_error", {"call_id": call_id, "error": "Timeout"})

        # ── Determine status & persist ─────────────────────────────────
        try:
            parsed = json.loads(result_content)
            status = "error" if (isinstance(parsed, dict) and parsed.get("error")) else "done"
        except Exception:
            status = "done"

        tool_call_card = [{
            "callId": call_id,
            "tool": tool_name,
            "args": args,
            "riskLevel": risk_level,
            "status": status,
            "result": result_content[:2000],
        }]
        await _persist_message(
            session_id, "tool", result_content, tool_call_card, tool_call_id=call_id
        )
        tool_messages.append(ToolMessage(content=result_content, tool_call_id=call_id))

    return {"messages": tool_messages}


async def finalize(state: AgentState) -> dict:
    """Persist the final assistant message and send completion events."""
    ws = state["ws"]
    session_id = state["session_id"]
    ai_message: AIMessage = state["messages"][-1]  # type: ignore[assignment]

    content = ai_message.content if isinstance(ai_message.content, str) else str(ai_message.content)
    await _persist_message(session_id=session_id, role="assistant", content=content, tool_calls=None)
    await send_event(ws, "cat_state", {"state": "success"})

    return {}


async def _generate_title(state: AgentState, assistant_reply: str) -> None:
    """Generate a conversation title using the LLM after the first round."""
    import traceback
    from langchain_core.messages import HumanMessage as _HM

    ws = state["ws"]
    session_id = state["session_id"]
    llm_config = state["llm_config"]

    # Extract first user message
    user_content = ""
    for m in state["messages"]:
        if isinstance(m, _HM):
            user_content = m.content if isinstance(m.content, str) else str(m.content)
            break
    if not user_content:
        return

    prompt = (
        "请用不超过15个字的中文为以下对话生成一个简短标题，只输出标题本身，不要加引号和标点：\n"
        f"用户: {user_content[:200]}\n助手: {assistant_reply[:200]}"
    )
    try:
        model = get_chat_model(llm_config)
        model = model.with_retry(
            stop_after_attempt=3,
            wait_exponential_jitter=True,
        )
        result = await model.ainvoke([_HM(content=prompt)])
        title = (result.content.strip() if isinstance(result.content, str) else str(result.content).strip())[:30]
        if not title:
            return
        # Update DB
        async with AsyncSessionLocal() as db:
            session = await db.get(Session, session_id)
            if session:
                session.title = title
                await db.commit()
        # Push to client
        await send_event(ws, "title_update", {"session_id": session_id, "title": title})
    except Exception:
        traceback.print_exc()  # Log errors for debugging


# ── Conditional router ───────────────────────────────────────────────────────


def should_continue(state: AgentState) -> str:
    """Route to 'tools' if the last AIMessage has tool calls, else to 'finalize'."""
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return "finalize"
