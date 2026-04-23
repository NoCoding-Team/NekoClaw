import logging
import uuid
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
        # Create memory_chunks table for LlamaIndex hybrid search
        await conn.execute(
            __import__("sqlalchemy").text("""
                CREATE TABLE IF NOT EXISTS memory_chunks (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL,
                    file_path TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    embedding vector(1536),
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


async def on_startup():
    await create_tables()
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
