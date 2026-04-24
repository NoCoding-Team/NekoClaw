"""
Daily note generation service.

Backend-internal cron that runs at 23:50 each day, summarizing
the day's conversations into a daily note file ({date}.md) for
each active user.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.config import settings

logger = logging.getLogger(__name__)

_cron_task: asyncio.Task | None = None

_DAILY_NOTE_CONFIG_DEFAULTS: dict = {"auto_generate": True, "note_time": "23:50", "max_retries": 2}


def _load_user_daily_config(user_id: str) -> dict:
    """Load per-user daily note config from .daily_note_config.json. Returns defaults if missing."""
    import json
    fpath = os.path.join(settings.MEMORY_FILES_DIR, user_id, ".daily_note_config.json")
    if not os.path.isfile(fpath):
        return dict(_DAILY_NOTE_CONFIG_DEFAULTS)
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {**_DAILY_NOTE_CONFIG_DEFAULTS, **data}
    except Exception:
        return dict(_DAILY_NOTE_CONFIG_DEFAULTS)


async def generate_daily_note(user_id: str, target_date: date | None = None, max_retries: int = 2) -> tuple[str | None, str]:
    """Generate a daily note for a user by summarizing the day's conversations.

    Returns (content, reason) where reason is one of: 'ok', 'no_messages', 'no_llm_config', 'llm_error'.
    """
    from app.models.base import AsyncSessionLocal
    from app.models.message import Message
    from app.models.session import Session
    from sqlalchemy import select, and_

    if target_date is None:
        target_date = date.today()

    # Query today's messages across all sessions
    day_start = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Message)
            .join(Session, Message.session_id == Session.id)
            .where(
                and_(
                    Session.user_id == user_id,
                    Message.created_at >= day_start,
                    Message.created_at < day_end,
                    Message.deleted_at.is_(None),
                    Message.role.in_(["user", "assistant"]),
                )
            )
            .order_by(Message.created_at.asc())
            .limit(200)  # cap to prevent huge prompts
        )
        messages = result.scalars().all()

    if not messages:
        return None, 'no_messages'

    # Build conversation text for summarization
    conv_text = "\n".join(f"{m.role}: {(m.content or '')[:500]}" for m in messages)

    # Get a working LLM config for summarization
    llm_config = await _get_summary_llm_config(user_id)
    if not llm_config:
        logger.warning("daily_note user=%s date=%s status=skipped reason=no_llm_config", user_id, target_date.isoformat())
        return None, 'no_llm_config'

    summary_prompt = [
        SystemMessage(content=(
            f"请为 {target_date.isoformat()} 的对话生成每日汇总笔记。\n\n"
            "要求：\n"
            "- 使用 Markdown 格式\n"
            "- 按话题分组\n"
            "- 提取关键讨论点、决策、待办事项\n"
            "- 简洁但完整，不遗漏重要信息\n"
            "- 不超过 2000 字\n"
        )),
        HumanMessage(content=f"以下是今天的对话记录：\n\n{conv_text}"),
    ]

    note_content: str | None = None
    for attempt in range(max(1, max_retries + 1)):
        try:
            from app.services.agent.provider import get_chat_model
            model = get_chat_model(llm_config)
            resp = await model.ainvoke(summary_prompt)
            note_content = resp.content if isinstance(resp.content, str) else f"# {target_date.isoformat()} 日志\n\n（生成失败）"
            break
        except Exception:
            if attempt < max_retries:
                wait = 2 ** attempt
                logger.warning("daily_note user=%s date=%s retry=%d/%d sleeping=%ds", user_id, target_date.isoformat(), attempt + 1, max_retries, wait)
                await asyncio.sleep(wait)
            else:
                logger.warning("daily_note user=%s date=%s status=failed reason=llm_error attempts=%d", user_id, target_date.isoformat(), attempt + 1, exc_info=True)
                return None, 'llm_error'
    if note_content is None:
        return None, 'llm_error'

    # Write to file
    user_dir = os.path.join(settings.MEMORY_FILES_DIR, user_id)
    notes_dir = os.path.join(user_dir, "notes")
    os.makedirs(notes_dir, exist_ok=True)
    fpath = os.path.join(notes_dir, f"{target_date.isoformat()}.md")
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(note_content)

    # Trigger index rebuild
    try:
        from app.services.memory_search import rebuild_memory_index
        await rebuild_memory_index(user_id, f"notes/{target_date.isoformat()}.md")
    except Exception:
        logger.warning("Index rebuild failed after daily note generation", exc_info=True)

    logger.info("daily_note user=%s date=%s status=success path=%s", user_id, target_date.isoformat(), fpath)
    return note_content, 'ok'


async def _get_summary_llm_config(user_id: str) -> Any | None:
    """Get a working LLM config for the user (user default > global default)."""
    from app.models.base import AsyncSessionLocal
    from app.models.llm_config import LLMConfig
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        # Try user's default config first
        result = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id == user_id,
                LLMConfig.is_default.is_(True),
                LLMConfig.deleted_at.is_(None),
            )
        )
        cfg = result.scalar_one_or_none()
        if cfg:
            return cfg

        # Fall back to global default
        result = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id.is_(None),
                LLMConfig.is_default.is_(True),
                LLMConfig.deleted_at.is_(None),
            )
        )
        cfg = result.scalar_one_or_none()
        if cfg:
            return cfg

        # Fall back to any available config for this user
        result = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id == user_id,
                LLMConfig.deleted_at.is_(None),
            ).limit(1)
        )
        cfg = result.scalar_one_or_none()
        if cfg:
            return cfg

        # Fall back to any global config
        result = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id.is_(None),
                LLMConfig.deleted_at.is_(None),
            ).limit(1)
        )
        return result.scalar_one_or_none()


async def daily_note_cron() -> None:
    """Minute-loop cron: checks each active user's schedule and generates daily notes at their configured UTC time."""
    generated_today: set[str] = set()
    last_reset_date = date.today()

    while True:
        try:
            await asyncio.sleep(60)

            now = datetime.now(timezone.utc)
            today = now.date()

            # Reset daily tracking at midnight UTC
            if today != last_reset_date:
                generated_today.clear()
                last_reset_date = today

            # Find all users who had conversations today
            from app.models.base import AsyncSessionLocal
            from app.models.message import Message
            from app.models.session import Session
            from sqlalchemy import select, and_, distinct

            day_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(distinct(Session.user_id))
                    .join(Message, Message.session_id == Session.id)
                    .where(
                        and_(
                            Message.created_at >= day_start,
                            Message.deleted_at.is_(None),
                            Message.role == "user",
                        )
                    )
                )
                user_ids = [row[0] for row in result.fetchall()]

            for uid in user_ids:
                if uid in generated_today:
                    continue
                cfg = _load_user_daily_config(uid)
                if not cfg.get("auto_generate", True):
                    continue
                # Check if current UTC time matches user's configured note_time
                try:
                    note_hour, note_minute = map(int, str(cfg.get("note_time", "23:50")).split(":"))
                except ValueError:
                    note_hour, note_minute = 23, 50
                if now.hour == note_hour and now.minute == note_minute:
                    try:
                        _, reason = await generate_daily_note(uid, today, max_retries=cfg.get("max_retries", 2))
                        if reason == 'ok':
                            generated_today.add(uid)
                    except Exception:
                        logger.warning("daily_note user=%s date=%s status=failed reason=exception", uid, today.isoformat(), exc_info=True)

        except asyncio.CancelledError:
            logger.info("Daily note cron cancelled")
            break
        except Exception:
            logger.error("Daily note cron error", exc_info=True)
            await asyncio.sleep(60)


def start_daily_note_cron() -> None:
    """Start the daily note cron as a background asyncio task."""
    global _cron_task
    if _cron_task is not None and not _cron_task.done():
        return
    _cron_task = asyncio.create_task(daily_note_cron())
    logger.info("Daily note cron started")


def stop_daily_note_cron() -> None:
    """Cancel the daily note cron task."""
    global _cron_task
    if _cron_task is not None and not _cron_task.done():
        _cron_task.cancel()
        logger.info("Daily note cron stopped")
    _cron_task = None
