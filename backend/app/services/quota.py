"""
Quota service — check and consume daily message / creation quotas.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.base import AsyncSessionLocal
from app.models.daily_usage import UserDailyUsage
from app.models.user import User

logger = logging.getLogger(__name__)

_quota_reset_task: asyncio.Task | None = None


def quota_today() -> date:
    """Get current quota date in configured timezone (default Asia/Shanghai)."""
    try:
        tz = ZoneInfo(settings.QUOTA_TIMEZONE)
        return datetime.now(tz).date()
    except Exception:
        return date.today()


async def get_or_create_usage(user_id: str, today: date, db: AsyncSession) -> UserDailyUsage:
    """Lazily get or create the usage record for today."""
    result = await db.execute(
        select(UserDailyUsage).where(
            UserDailyUsage.user_id == user_id,
            UserDailyUsage.date == today,
        )
    )
    usage = result.scalar_one_or_none()
    if usage is None:
        usage = UserDailyUsage(user_id=user_id, date=today, messages_used=0, creation_used=0)
        db.add(usage)
        await db.flush()
    return usage


async def apply_daily_quota_limits(db: AsyncSession) -> int:
    """Set all active users' daily limits to configured reset values."""
    result = await db.execute(
        update(User)
        .where(User.deleted_at.is_(None))
        .values(
            daily_message_limit=settings.DAILY_MESSAGE_RESET_LIMIT,
            daily_creation_limit=settings.DAILY_CREATION_RESET_LIMIT,
        )
    )
    await db.commit()
    return int(result.rowcount or 0)


async def apply_daily_quota_limits_now() -> int:
    """Apply configured quota limits immediately."""
    async with AsyncSessionLocal() as db:
        return await apply_daily_quota_limits(db)


async def _daily_quota_reset_loop() -> None:
    """Run every day at 00:00 in configured timezone and reset all user limits."""
    while True:
        try:
            tz = ZoneInfo(settings.QUOTA_TIMEZONE)
            now = datetime.now(tz)
        except Exception:
            now = datetime.now()

        next_midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        wait_seconds = max((next_midnight - now).total_seconds(), 1)
        logger.info(
            "quota_reset next_run_at=%s wait_seconds=%.0f timezone=%s",
            next_midnight.isoformat(),
            wait_seconds,
            settings.QUOTA_TIMEZONE,
        )
        await asyncio.sleep(wait_seconds)

        try:
            updated = await apply_daily_quota_limits_now()
            logger.info(
                "quota_reset done users=%d message_limit=%d creation_limit=%d",
                updated,
                settings.DAILY_MESSAGE_RESET_LIMIT,
                settings.DAILY_CREATION_RESET_LIMIT,
            )
        except Exception:
            logger.exception("quota_reset failed")


def start_daily_quota_reset_background() -> None:
    """Start quota reset background loop once."""
    global _quota_reset_task
    if _quota_reset_task and not _quota_reset_task.done():
        return
    _quota_reset_task = asyncio.get_running_loop().create_task(_daily_quota_reset_loop())
    logger.info("quota reset background loop started")


async def check_message_quota(user: User, db: AsyncSession) -> tuple[bool, int, int]:
    """
    Check if the user can send a message.

    Returns (allowed, limit, used).
    If daily_message_limit == -1, always returns (True, -1, used).
    """
    if user.daily_message_limit == -1:
        today = quota_today()
        usage = await get_or_create_usage(user.id, today, db)
        await db.commit()
        return True, -1, usage.messages_used

    today = quota_today()
    usage = await get_or_create_usage(user.id, today, db)
    await db.commit()
    allowed = usage.messages_used < user.daily_message_limit
    return allowed, user.daily_message_limit, usage.messages_used


async def consume_message(user_id: str, db: AsyncSession) -> None:
    """Increment today's messages_used for the user."""
    today = quota_today()
    usage = await get_or_create_usage(user_id, today, db)
    usage.messages_used += 1
    await db.commit()


async def check_creation_quota(user: User, db: AsyncSession) -> tuple[bool, int, int]:
    """
    Check if the user can consume a creation point.

    Returns (allowed, limit, used).
    If daily_creation_limit == -1, always returns (True, -1, used).
    """
    if user.daily_creation_limit == -1:
        today = quota_today()
        usage = await get_or_create_usage(user.id, today, db)
        await db.commit()
        return True, -1, usage.creation_used

    today = quota_today()
    usage = await get_or_create_usage(user.id, today, db)
    await db.commit()
    allowed = usage.creation_used < user.daily_creation_limit
    return allowed, user.daily_creation_limit, usage.creation_used


async def consume_creation(user_id: str, db: AsyncSession) -> None:
    """Increment today's creation_used for the user."""
    today = quota_today()
    usage = await get_or_create_usage(user_id, today, db)
    usage.creation_used += 1
    await db.commit()
