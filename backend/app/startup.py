import uuid
from app.models.base import engine, Base, AsyncSessionLocal
from app.models import user, session, message, llm_config, skill, memory, scheduled_task  # noqa: F401 - ensure all models are registered

_BUILTIN_SKILLS = [
    {
        "id": "builtin-general",
        "name": "通用助手",
        "icon": "🐱",
        "system_prompt": "你是一只聪明可爱的猫咪助手，叫做 NekoClaw。请用中文回答用户的问题，风格亲切自然。",
        "allowed_tools": [
            "web_search", "http_request",
            "file_read", "file_list",
            "browser_navigate", "browser_screenshot",
        ],
        "sandbox_level": "MEDIUM",
        "is_builtin": True,
    },
    {
        "id": "builtin-coder",
        "name": "代码助手",
        "icon": "💻",
        "system_prompt": (
            "你是一位精通各类编程语言的资深程序员猫咪，叫做 CodeNeko。"
            "你擅长写代码、调试 Bug、解释原理。请直接给出可运行的代码示例，并用中文说明。"
        ),
        "allowed_tools": [
            "file_read", "file_write", "file_list",
            "shell_exec",
            "web_search",
        ],
        "sandbox_level": "HIGH",
        "is_builtin": True,
    },
    {
        "id": "builtin-filekeeper",
        "name": "文件管家",
        "icon": "📁",
        "system_prompt": (
            "你是一位细心的文件管家猫咪，叫做 FiloNeko。"
            "你帮助用户整理文件，读取、移动、重命名文件，以及浏览目录结构。请用中文交流。"
        ),
        "allowed_tools": [
            "file_read", "file_write", "file_list", "file_delete",
            "shell_exec",
        ],
        "sandbox_level": "HIGH",
        "is_builtin": True,
    },
]


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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


async def _seed_builtin_skills():
    from app.models.skill import Skill
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        for data in _BUILTIN_SKILLS:
            existing = await db.get(Skill, data["id"])
            if existing is None:
                db.add(Skill(**data))
        await db.commit()


async def on_startup():
    await create_tables()
    await _seed_builtin_skills()
