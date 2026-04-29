import logging
import uuid
import os
import re
import shutil
from datetime import date, datetime, timedelta, timezone
from app.models.base import engine, Base, AsyncSessionLocal
from app.models import user, session, message, llm_config, memory, scheduled_task, scheduled_task_run, skill_config, daily_usage, tool_config  # noqa: F401 - ensure all models are registered

logger = logging.getLogger(__name__)


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Enable pgvector extension in a separate transaction so that a failure
    # does not roll back the create_all DDL above.
    try:
        async with engine.begin() as conn:
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
        # Session source and memory policy: distinguish normal chat from scheduled tasks.
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'chat'"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS memory_policy VARCHAR(32) NOT NULL DEFAULT 'auto'"
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
        # DeepSeek thinking-mode: store reasoning_content for assistant messages
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS reasoning_content TEXT NULL"
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
        # Scheduled task execution fields and history.
        await conn.execute(
            __import__("sqlalchemy").text(
                """
                CREATE TABLE IF NOT EXISTS scheduled_task_runs (
                    id VARCHAR(36) PRIMARY KEY,
                    task_id VARCHAR(36) NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    scheduled_for TIMESTAMPTZ NULL,
                    started_at TIMESTAMPTZ NULL,
                    finished_at TIMESTAMPTZ NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'running',
                    trigger_type VARCHAR(16) NOT NULL DEFAULT 'auto',
                    session_id VARCHAR(36) NULL REFERENCES sessions(id),
                    allowed_tools_snapshot JSON NOT NULL DEFAULT '[]'::json,
                    error_message TEXT NULL,
                    summary TEXT NULL,
                    duration_ms INTEGER NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    deleted_at TIMESTAMPTZ NULL
                )
                """
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task_id ON scheduled_task_runs (task_id)"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_user_id ON scheduled_task_runs (user_id)"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_session_id ON scheduled_task_runs (session_id)"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_status ON scheduled_task_runs (status)"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(16) NOT NULL DEFAULT 'once'"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'UTC'"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS allowed_tools JSON NOT NULL DEFAULT '[]'::json"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'enabled'"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS last_status VARCHAR(16) NULL"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS missed_count INTEGER NOT NULL DEFAULT 0"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                """
                UPDATE scheduled_tasks
                SET schedule_type = CASE WHEN cron_expr IS NOT NULL THEN 'cron' ELSE 'once' END,
                    status = CASE WHEN is_enabled THEN 'enabled' ELSE 'paused' END
                WHERE schedule_type IS NULL OR schedule_type = ''
                """
            )
        )
        # Admin panel: user daily quota fields
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_message_limit INTEGER NOT NULL DEFAULT 100"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_creation_limit INTEGER NOT NULL DEFAULT 50"
            )
        )
        # Keep DB defaults aligned with runtime quota reset values
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE users ALTER COLUMN daily_message_limit SET DEFAULT 100"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE users ALTER COLUMN daily_creation_limit SET DEFAULT 50"
            )
        )
        # Admin panel: per-user daily usage tracking table
        await conn.execute(
            __import__("sqlalchemy").text(
                """
                CREATE TABLE IF NOT EXISTS user_daily_usage (
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    date DATE NOT NULL,
                    messages_used INTEGER NOT NULL DEFAULT 0,
                    creation_used INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    deleted_at TIMESTAMPTZ NULL,
                    PRIMARY KEY (user_id, date)
                )
                """
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "CREATE INDEX IF NOT EXISTS idx_user_daily_usage_user_id ON user_daily_usage (user_id)"
            )
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


async def _backfill_scheduled_task_state() -> None:
    """Fill derived fields for tasks created before the execution workflow."""
    from sqlalchemy import select
    from app.api.scheduled_tasks import _sync_task_state
    from app.models.scheduled_task import ScheduledTask

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ScheduledTask).where(ScheduledTask.deleted_at.is_(None))
        )
        tasks = result.scalars().all()
        changed = False
        for task in tasks:
            if not task.schedule_type:
                task.schedule_type = "cron" if task.cron_expr else "once"
            if task.allowed_tools is None:
                task.allowed_tools = []
            _sync_task_state(task)
            changed = True
        if changed:
            await db.commit()


async def _ensure_admin_user() -> None:
    """如果 .env 配置了 ADMIN_USERNAME/ADMIN_PASSWORD，首次启动时自动创建管理员账号。"""
    from app.core.config import settings
    from app.core.security import hash_password
    from app.models.user import User
    from sqlalchemy import select

    username = settings.ADMIN_USERNAME.strip()
    password = settings.ADMIN_PASSWORD.strip()
    if not username or not password:
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username))
        existing = result.scalar_one_or_none()
        if existing is not None:
            # 已存在：仅确保 is_admin=True
            if not existing.is_admin:
                existing.is_admin = True
                await db.commit()
                logger.info("ensure_admin: upgraded '%s' to admin", username)
            else:
                logger.info("ensure_admin: admin user '%s' already exists, skipped", username)
            return
        admin = User(
            id=str(uuid.uuid4()),
            username=username,
            hashed_password=hash_password(password),
            is_admin=True,
        )
        db.add(admin)
        await db.commit()
        logger.info("ensure_admin: created admin user '%s'", username)


async def on_startup():
    await create_tables()
    # 自动创建初始管理员账号（.env ADMIN_USERNAME / ADMIN_PASSWORD）
    await _ensure_admin_user()
    # Backfill scheduled task derived state for older databases.
    await _backfill_scheduled_task_state()
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
    # Apply quota defaults immediately and then reset daily at 00:00
    from app.services.quota import apply_daily_quota_limits_now, start_daily_quota_reset_background
    updated = await apply_daily_quota_limits_now()
    logger.info("quota_reset: startup applied users=%d message_limit=100 creation_limit=50", updated)
    start_daily_quota_reset_background()
    # Pre-load jieba dictionary to avoid first-search delay
    import jieba
    jieba.initialize()
