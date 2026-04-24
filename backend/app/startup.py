import logging
import uuid
import os
import re
import shutil
from datetime import date, datetime, timedelta, timezone
from app.models.base import engine, Base, AsyncSessionLocal
from app.models import user, session, message, llm_config, memory, scheduled_task, skill_config  # noqa: F401 - ensure all models are registered

logger = logging.getLogger(__name__)


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Enable pgvector extension (required for memory vector search)
        # Warn and continue if pgvector is not installed on the PG server
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "CREATE EXTENSION IF NOT EXISTS vector"
                )
            )
        except Exception as e:
            logger.warning(
                "pgvector extension not available — vector search disabled. "
                "Install postgresql-<ver>-pgvector on the PG host to enable it. "
                f"Error: {e}"
            )
    # 对已有数据库做字段补全迁移（ADD COLUMN IF NOT EXISTS，PostgreSQL 支持）
    async with engine.begin() as conn:
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(64) NULL"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT NULL"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NULL"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE memories ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0"
            )
        )
        # Message ordering: add seq column for deterministic ordering within session
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS seq INTEGER NOT NULL DEFAULT 0"
            )
        )
        # LLMConfig temperature: added in langgraph-migration
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE llm_configs ADD COLUMN IF NOT EXISTS temperature FLOAT NOT NULL DEFAULT 0.7"
            )
        )
        # Message tool_call_id: store OpenAI tool_call_id for role='tool' messages
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_call_id VARCHAR(64) NULL"
            )
        )
        # Backfill seq for existing messages (based on created_at order within each session)
        await conn.execute(
            __import__("sqlalchemy").text(
                """
                WITH ranked AS (
                    SELECT id,
                           ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at, id) AS rn
                    FROM messages
                    WHERE seq = 0
                )
                UPDATE messages SET seq = ranked.rn
                FROM ranked WHERE messages.id = ranked.id AND messages.seq = 0
                """
            )
        )
        # Backfill tool_call_id from tool_calls JSON for role='tool' messages
        await conn.execute(
            __import__("sqlalchemy").text(
                """
                UPDATE messages
                SET tool_call_id = (tool_calls->0->>'callId')
                WHERE role = 'tool'
                  AND tool_call_id IS NULL
                  AND tool_calls IS NOT NULL
                  AND json_array_length(tool_calls) > 0
                """
            )
        )
        # Migration: drop sessions.skill_id FK and column (Skill system replaced by SKILL.md files)
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE sessions DROP COLUMN IF EXISTS skill_id"
            )
        )
        # Migration: drop legacy skills table
        await conn.execute(
            __import__("sqlalchemy").text(
                "DROP TABLE IF EXISTS skills"
            )
        )
        # Create memory_chunks table for LlamaIndex BM25 (text only, vectors in Milvus)
        await conn.execute(
            __import__("sqlalchemy").text("""
                CREATE TABLE IF NOT EXISTS memory_chunks (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL,
                    file_path TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)
        )
        await conn.execute(
            __import__("sqlalchemy").text("""
                CREATE INDEX IF NOT EXISTS idx_memory_chunks_user_file
                ON memory_chunks (user_id, file_path)
            """)
        )


_DATE_FILE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")


async def _migrate_daily_notes_to_subfolder() -> None:
    """Move YYYY-MM-DD.md files from user memory root into notes/ subfolder."""
    from app.core.config import settings

    mem_root = settings.MEMORY_FILES_DIR
    if not os.path.isdir(mem_root):
        return
    for user_id in os.listdir(mem_root):
        user_dir = os.path.join(mem_root, user_id)
        if not os.path.isdir(user_dir):
            continue
        notes_dir = os.path.join(user_dir, "notes")
        moved = 0
        for fname in os.listdir(user_dir):
            if not _DATE_FILE_RE.match(fname):
                continue
            src = os.path.join(user_dir, fname)
            if not os.path.isfile(src):
                continue
            os.makedirs(notes_dir, exist_ok=True)
            dst = os.path.join(notes_dir, fname)
            if os.path.exists(dst):
                logger.warning("migrate_notes: skipping %s (already exists at %s)", src, dst)
                continue
            shutil.move(src, dst)
            moved += 1
        if moved:
            logger.info("migrate_notes: moved %d daily note(s) for user %s", moved, user_id)


async def _backfill_yesterday_notes() -> None:
    """Generate yesterday's daily note for users who had conversations but no note."""
    from app.core.config import settings
    from app.models.message import Message
    from app.models.session import Session
    from sqlalchemy import select, and_, distinct

    yesterday = date.today() - timedelta(days=1)
    day_start = datetime.combine(yesterday, datetime.min.time()).replace(tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(distinct(Session.user_id))
            .join(Message, Message.session_id == Session.id)
            .where(
                and_(
                    Message.created_at >= day_start,
                    Message.created_at < day_end,
                    Message.deleted_at.is_(None),
                    Message.role == "user",
                )
            )
        )
        user_ids = [row[0] for row in result.fetchall()]

    for uid in user_ids:
        notes_dir = os.path.join(settings.MEMORY_FILES_DIR, uid, "notes")
        note_path = os.path.join(notes_dir, f"{yesterday.isoformat()}.md")
        if os.path.isfile(note_path):
            continue
        try:
            from app.services.daily_note import generate_daily_note
            _, reason = await generate_daily_note(uid, yesterday)
            logger.info("backfill_notes: generated yesterday note for user %s reason=%s", uid, reason)
        except Exception:
            logger.warning("backfill_notes: failed for user %s", uid, exc_info=True)


async def on_startup():
    await create_tables()
    # Migrate daily notes from root to notes/ subfolder
    await _migrate_daily_notes_to_subfolder()
    # Backfill yesterday's daily notes if missing
    await _backfill_yesterday_notes()
    # Load agent skills from backend/skills/
    from app.services.skill_loader import scan_skills
    scan_skills()
    # Async Docker check + sandbox image preparation
    from app.services.tools.container import check_docker, ensure_sandbox_image
    if await check_docker():
        await ensure_sandbox_image()
    # Start daily digest background cron job (UTC 18:00 = UTC+8 02:00)
    from app.services.daily_digest import start_daily_digest_background
    start_daily_digest_background()
    # Start daily note generation cron (23:50 local time)
    from app.services.daily_note import start_daily_note_cron
    start_daily_note_cron()
    # Pre-load jieba dictionary to avoid first-search delay
    import jieba
    jieba.initialize()
