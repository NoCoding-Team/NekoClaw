"""
Conversation compaction using tiktoken for precise token counting.

Replaces the heuristic estimate_tokens() with tiktoken-based counting,
and implements 50%-threshold conversation compression.
"""
from __future__ import annotations

import logging
from typing import Any

import tiktoken
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

# ── Encoder selection ──────────────────────────────────────────────────────

# Cache encoders to avoid repeated initialization
_encoder_cache: dict[str, tiktoken.Encoding] = {}


def get_encoder(model_name: str = "") -> tiktoken.Encoding:
    """Select tiktoken encoder based on model name.

    - gpt-4o / gpt-4o-mini → o200k_base
    - gpt-4-turbo / gpt-3.5 → cl100k_base
    - Claude / Gemini / others → cl100k_base (approximate, ~5-20% error)
    """
    model_lower = model_name.lower() if model_name else ""

    if "gpt-4o" in model_lower or "4o-mini" in model_lower:
        enc_name = "o200k_base"
    else:
        enc_name = "cl100k_base"

    if enc_name not in _encoder_cache:
        _encoder_cache[enc_name] = tiktoken.get_encoding(enc_name)
    return _encoder_cache[enc_name]


# ── Token counting ─────────────────────────────────────────────────────────


def count_tokens(text: str, encoder: tiktoken.Encoding | None = None) -> int:
    """Count tokens in a text string using tiktoken."""
    if not text:
        return 0
    if encoder is None:
        encoder = get_encoder()
    return len(encoder.encode(text))


def count_message_tokens(messages: list[Any], model_name: str = "") -> int:
    """Count total tokens across a list of messages (LangChain BaseMessage or ORM)."""
    encoder = get_encoder(model_name)
    total = 0
    for m in messages:
        content = ""
        if isinstance(m, BaseMessage):
            content = m.content if isinstance(m.content, str) else str(m.content)
        elif hasattr(m, "content"):
            content = m.content or ""
        total += count_tokens(content, encoder)
        total += 4  # per-message overhead (role, separators)
    return total


# ── Compression decision ───────────────────────────────────────────────────

COMPRESS_THRESHOLD = 0.50  # trigger at 50% of context_limit


def should_compress(
    messages: list[Any],
    context_limit: int,
    system_prompt_tokens: int = 0,
    model_name: str = "",
) -> bool:
    """Check if conversation tokens exceed 50% of available context."""
    available = context_limit - system_prompt_tokens
    if available <= 0:
        return False
    total = count_message_tokens(messages, model_name)
    return total > available * COMPRESS_THRESHOLD


# ── Compression execution ─────────────────────────────────────────────────


async def compress_messages(
    messages: list[Any],  # list[Message ORM]
    llm_config: Any | None,
    session_id: str = "",
    user_id: str = "",
) -> list[Any]:
    """Compress front 50% of messages via LLM summary.

    1. Triggers memory_refresh first (save important info before compressing)
    2. Summarizes front 50% messages with LLM
    3. Returns compressed message list: [summary_msg] + back_half
    """
    if not llm_config or len(messages) < 10:
        return messages

    # Split at 50%
    split_idx = len(messages) // 2
    to_compress = messages[:split_idx]
    to_keep = messages[split_idx:]

    # Memory refresh before compression — build query_hint from messages
    try:
        from app.services.agent.context import memory_refresh
        hint_parts: list[str] = []
        user_count = 0
        for m in reversed(messages):
            if m.role == "user" and m.content and user_count < 3:
                hint_parts.append(m.content[:150])
                user_count += 1
        query_hint = " ".join(hint_parts)[:500]
        await memory_refresh(session_id, user_id, messages, llm_config, query_hint=query_hint)
    except Exception:
        pass  # best-effort

    # LLM summarization
    conversation_text = "\n".join(
        f"{m.role}: {m.content or ''}" for m in to_compress
    )
    summary_prompt = [
        SystemMessage(content="请将以下对话历史压缩为简洁摘要，保留关键信息、决策和上下文："),
        HumanMessage(content=conversation_text),
    ]

    try:
        from app.services.agent.provider import get_chat_model
        model = get_chat_model(llm_config)
        resp = await model.ainvoke(summary_prompt)
        summary = resp.content if isinstance(resp.content, str) else "（历史对话摘要）"
    except Exception:
        summary = "（历史对话已压缩）"

    # Persist: soft-delete compressed messages, insert summary
    import uuid
    from datetime import datetime, timezone
    from sqlalchemy import func, select
    from app.models.base import AsyncSessionLocal
    from app.models.message import Message

    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        for m in to_compress:
            db_msg = await db.get(Message, m.id)
            if db_msg:
                db_msg.deleted_at = now

        result = await db.execute(
            select(func.coalesce(func.max(Message.seq), 0)).where(
                Message.session_id == session_id
            )
        )
        next_seq = (result.scalar() or 0) + 1

        summary_msg = Message(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role="system",
            content=f"[对话历史摘要]\n{summary}",
            seq=next_seq,
        )
        db.add(summary_msg)
        await db.commit()
        await db.refresh(summary_msg)

    return [summary_msg] + list(to_keep)
