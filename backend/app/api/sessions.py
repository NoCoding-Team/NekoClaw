import uuid
from datetime import timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.base import AsyncSessionLocal
from app.models.session import Session
from app.models.message import Message
from app.models.user import User
from app.schemas.session import SessionCreate, SessionResponse, MessageResponse, MessageCreate, SessionUpdate, GenerateTitleRequest

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session)
        .where(Session.user_id == current_user.id, Session.deleted_at.is_(None))
        .order_by(Session.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    body: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = Session(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=body.title,
        skill_id=body.skill_id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    body: SessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.deleted_at.is_(None))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session not found")
    if session.user_id != current_user.id:
        raise ForbiddenError()
    session.title = body.title
    await db.commit()
    await db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.deleted_at.is_(None))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session not found")
    if session.user_id != current_user.id:
        raise ForbiddenError()

    from datetime import datetime, timezone
    session.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.get("/{session_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.deleted_at.is_(None))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session not found")
    if session.user_id != current_user.id:
        raise ForbiddenError()

    msgs = await db.execute(
        select(Message)
        .where(Message.session_id == session_id, Message.deleted_at.is_(None))
        .order_by(Message.seq.asc(), Message.created_at.asc())
    )
    return msgs.scalars().all()


@router.post("/{session_id}/messages", response_model=MessageResponse, status_code=201)
async def create_message(
    session_id: str,
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.deleted_at.is_(None))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session not found")
    if session.user_id != current_user.id:
        raise ForbiddenError()

    from sqlalchemy import func as fn
    seq_result = await db.execute(
        select(fn.coalesce(fn.max(Message.seq), 0)).where(Message.session_id == session_id)
    )
    next_seq = (seq_result.scalar() or 0) + 1

    kwargs: dict = {
        "session_id": session_id,
        "role": body.role,
        "content": body.content,
        "tool_calls": body.tool_calls,
        "seq": next_seq,
    }
    if body.created_at is not None:
        kwargs["created_at"] = body.created_at
    msg = Message(**kwargs)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


@router.post("/{session_id}/messages/batch", status_code=201)
async def batch_create_messages(
    session_id: str,
    body: list[MessageCreate],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a batch of local messages to a server session (sync use case)."""
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.deleted_at.is_(None))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session not found")
    if session.user_id != current_user.id:
        raise ForbiddenError()

    # Get current max seq for this session
    from sqlalchemy import func as fn
    seq_result = await db.execute(
        select(fn.coalesce(fn.max(Message.seq), 0)).where(Message.session_id == session_id)
    )
    current_seq = seq_result.scalar() or 0

    seen_timestamps: dict = {}
    for item in body:
        ts = item.created_at
        if ts is not None:
            # Normalise to UTC-aware datetime for dedup tracking
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            key = ts
            count = seen_timestamps.get(key, 0)
            if count:
                # Nudge by count microseconds so that messages with identical
                # millisecond timestamps still get a deterministic strict order.
                ts = ts + timedelta(microseconds=count)
            seen_timestamps[key] = count + 1

        current_seq += 1
        kwargs: dict = {
            "session_id": session_id,
            "role": item.role,
            "content": item.content,
            "tool_calls": item.tool_calls,
            "seq": current_seq,
        }
        # Pass created_at directly in the constructor so SQLAlchemy includes it in
        # the INSERT statement. Setting it after construction with server_default
        # may cause the column to be omitted, making all messages share the same
        # DB-generated timestamp and rendering ORDER BY created_at unreliable.
        if ts is not None:
            kwargs["created_at"] = ts
        msg = Message(**kwargs)
        db.add(msg)
    await db.commit()
    return {"ok": True, "count": len(body)}


# ── Title generation ──────────────────────────────────────────────────────
@router.post("/generate-title")
async def generate_title(
    body: GenerateTitleRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a short conversation title via LLM given user message + AI reply."""
    from langchain_core.messages import HumanMessage as _HM

    prompt = (
        "请用不超过15个字的中文为以下对话生成一个简短标题，只输出标题本身，不要加引号和标点：\n"
        f"用户: {body.user_message[:200]}\n助手: {body.ai_reply[:200]}"
    )

    try:
        # Use custom LLM config from client if provided
        if body.custom_llm_config:
            cfg = body.custom_llm_config
            provider = (cfg.get("provider") or "openai").lower()
            api_key = cfg.get("api_key", "")
            model_name = cfg.get("model", "")
            base_url = cfg.get("base_url")
            temperature = cfg.get("temperature", 0.7)
            print(f"[generate-title] Using custom LLM: provider={provider}, model={model_name}")

            if provider == "anthropic":
                from langchain_anthropic import ChatAnthropic  # type: ignore[import-untyped]
                model = ChatAnthropic(model=model_name, api_key=api_key, temperature=temperature, streaming=False)  # type: ignore[call-arg]
            elif provider in ("gemini", "google"):
                from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore[import-untyped]
                model = ChatGoogleGenerativeAI(model=model_name, google_api_key=api_key, temperature=temperature)  # type: ignore[call-arg]
            else:
                from langchain_openai import ChatOpenAI  # type: ignore[import-untyped]
                kwargs: dict = {"model": model_name, "api_key": api_key, "temperature": temperature, "streaming": False}
                if base_url:
                    kwargs["base_url"] = base_url
                model = ChatOpenAI(**kwargs)  # type: ignore[call-arg]
        else:
            # Fallback: use the first available server-side LLM config
            print("[generate-title] No custom LLM config, using server fallback")
            from app.services.agent.provider import get_chat_model
            from app.models.llm_config import LLMConfig
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(LLMConfig).limit(1))
                llm_cfg = result.scalar_one_or_none()
            if not llm_cfg:
                print("[generate-title] No server LLM config found")
                return {"title": None, "error": "No LLM config available"}
            model = get_chat_model(llm_cfg)

        result = await model.ainvoke([_HM(content=prompt)])
        title = (result.content.strip() if isinstance(result.content, str) else str(result.content).strip())[:30]
        print(f"[generate-title] Generated: {title!r}")
        return {"title": title or None}
    except Exception as exc:
        import traceback; traceback.print_exc()
        return {"title": None, "error": str(exc)}
