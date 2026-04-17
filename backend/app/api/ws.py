"""
WebSocket endpoint for real-time session communication.

Event Types (server → client):
  cat_state           - {state: "idle"|"thinking"|"working"|"success"|"error"}
  llm_thinking        - {}
  llm_token           - {token: str}
  llm_done            - {message_id: str}
  tool_call           - {call_id: str, tool: str, args: dict, risk_level: str}  # client tool
  server_tool_call    - {call_id: str, tool: str, args: dict, risk_level: str}  # server tool (display only)
  server_tool_done    - {call_id: str, result: str}                             # server tool completed
  tool_denied         - {call_id: str, reason: str}
  tool_error          - {call_id: str, error: str}
  pong                - {}

Event Types (client → server):
  message        - {content: str, skill_id?: str}
  tool_result    - {call_id: str, result: any, error?: str}
  ping           - {}
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.exceptions import UnauthorizedError
from app.core.security import decode_token
from app.models.message import Message
from app.models.session import Session
from app.models.user import User
from app.models.base import AsyncSessionLocal

router = APIRouter(tags=["websocket"])

# Active connections: session_id → WebSocket
_active: dict[str, WebSocket] = {}
# Pending tool calls waiting for PC result: call_id → asyncio.Future
_pending_tool_calls: dict[str, asyncio.Future] = {}

HEARTBEAT_INTERVAL = 30  # seconds
HEARTBEAT_TIMEOUT = 90   # seconds


async def _authenticate(websocket: WebSocket) -> str:
    """Extract and validate JWT from query param or first message. Returns user_id."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        raise UnauthorizedError("缺少认证令牌")
    try:
        return decode_token(token, expected_type="access")
    except UnauthorizedError:
        await websocket.close(code=4001)
        raise


async def send_event(ws: WebSocket, event: str, data: dict):
    try:
        await ws.send_text(json.dumps({"event": event, **data}))
    except Exception:
        pass


@router.websocket("/ws/{session_id}")
async def websocket_session(session_id: str, websocket: WebSocket):
    await websocket.accept()

    # Authenticate
    try:
        user_id = await _authenticate(websocket)
    except UnauthorizedError:
        return

    # Verify session belongs to user
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Session).where(Session.id == session_id, Session.deleted_at.is_(None))
        )
        session = result.scalar_one_or_none()
        if not session or session.user_id != user_id:
            await websocket.close(code=4003)
            return

    _active[session_id] = websocket

    # Start heartbeat task
    heartbeat_task = asyncio.create_task(_heartbeat(websocket, session_id))

    try:
        while True:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_TIMEOUT)
            data = json.loads(raw)
            event = data.get("event")

            if event == "ping":
                await send_event(websocket, "pong", {})

            elif event == "message":
                asyncio.create_task(
                    _handle_message(session_id, user_id, data, websocket)
                )
            elif event == "tool_result":
                call_id = data.get("call_id")
                if call_id and call_id in _pending_tool_calls:
                    future = _pending_tool_calls.pop(call_id)
                    if not future.done():
                        future.set_result(data)

    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        heartbeat_task.cancel()
        _active.pop(session_id, None)
        # Clean up any pending tool call futures for this session to avoid leaks
        for call_id, future in list(_pending_tool_calls.items()):
            if not future.done():
                future.cancel()
            _pending_tool_calls.pop(call_id, None)


async def _heartbeat(ws: WebSocket, session_id: str):
    """Send periodic pings."""
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await send_event(ws, "ping", {})
    except asyncio.CancelledError:
        pass


async def _handle_message(session_id: str, user_id: str, data: dict, ws: WebSocket):
    """Process incoming user message: persist, run LangGraph agent."""
    import traceback
    from app.services.agent import run_agent

    content = data.get("content", "")
    skill_id = data.get("skill_id")
    allowed_tools: list[str] | None = data.get("allowed_tools")  # None=all, []=none, [...]= specified list
    custom_llm_config: dict | None = data.get("custom_llm_config")  # optional user-supplied LLM config
    ephemeral: bool = bool(data.get("ephemeral", False))
    local_history: list[dict] | None = data.get("local_history")  # [{role, content}, ...]

    # Persist user message (skip when ephemeral — data stays client-only)
    if not ephemeral:
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select as sel, func as fn
            result = await db.execute(
                sel(fn.coalesce(fn.max(Message.seq), 0)).where(Message.session_id == session_id)
            )
            next_seq = (result.scalar() or 0) + 1
            msg = Message(
                id=str(uuid.uuid4()),
                session_id=session_id,
                role="user",
                content=content,
                seq=next_seq,
            )
            db.add(msg)
            await db.commit()

    # Merge current user message into local_history so prepare has full context
    if ephemeral:
        local_history = (local_history or []) + [{"role": "user", "content": content}]

    await send_event(ws, "cat_state", {"state": "thinking"})
    await send_event(ws, "llm_thinking", {})

    try:
        await run_agent(
            session_id=session_id,
            user_id=user_id,
            skill_id=skill_id,
            ws=ws,
            allowed_tools_override=allowed_tools,
            custom_llm_config=custom_llm_config,
            ephemeral=ephemeral,
            local_history=local_history,
        )
    except Exception as exc:
        traceback.print_exc()
        err_msg = f"⚠️ Agent 执行出错: {exc}"
        await send_event(ws, "llm_token", {"token": err_msg})
        await send_event(ws, "llm_done", {"message_id": str(uuid.uuid4())})
        await send_event(ws, "cat_state", {"state": "error"})


async def get_pending_tool_future(call_id: str) -> asyncio.Future:
    """Register a future for a pending tool call. Caller awaits this future."""
    loop = asyncio.get_event_loop()
    future = loop.create_future()
    _pending_tool_calls[call_id] = future
    return future
