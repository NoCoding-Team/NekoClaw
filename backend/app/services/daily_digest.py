"""
Daily Digest: scheduled cron job that runs once per day (UTC 18:00 = UTC+8 02:00).
Scans all users' previous-day daily notes, evaluates their "nutritional value",
and consolidates worthwhile content into MEMORY.md.
"""
import asyncio
import json
import logging
import os
from datetime import date, timedelta
from typing import Any

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

from app.core.config import settings

logger = logging.getLogger("daily_digest")

_DIGEST_PROMPT = """\
你是每日记忆整理助手。请评估昨日笔记的营养价值，并将有价值的内容整合到长期记忆中。

## 营养价值评估标准
高价值（应整合到 MEMORY.md）：
- 用户偏好/习惯的新发现或变化
- 重要决策和结论
- 关键事实、项目进展
- 用户明确要求记住的内容

低价值（不需要整合）：
- 纯粹的闲聊、问候
- 一次性查询（天气、翻译等）
- 已经在 MEMORY.md 中存在的重复信息
- 临时的调试/中间步骤

## 操作步骤
1. memory_read("MEMORY.md") 读取现有长期记忆
2. 评估昨日笔记的营养价值
3. 如果有高价值内容：
   - 与 MEMORY.md 对比，执行整合（追加新信息、更新变化、合并重复、删除过时）
   - 保持 ## 分区结构
   - memory_write("MEMORY.md", 整合后的完整内容)
4. 如果全是低价值内容：不调用任何工具，直接回复"无需整合"
"""


async def _run_digest_for_user(user_id: str, yesterday_content: str, llm_config: Any) -> None:
    """Run digest sub-LLM for one user."""
    from app.services.agent.provider import get_chat_model
    from app.services.agent.tools import get_tools
    from app.services.tools.server_tools import execute_server_tool

    messages: list[BaseMessage] = [
        SystemMessage(content=_DIGEST_PROMPT),
        HumanMessage(content=f"以下是昨日笔记内容：\n\n{yesterday_content}"),
    ]

    memory_tool_list = get_tools(["memory_read", "memory_write", "memory_search"], None, user_id)
    model = get_chat_model(llm_config)
    if memory_tool_list:
        model = model.bind_tools(memory_tool_list)

    for _ in range(3):  # max 3 tool-call rounds
        resp = await model.ainvoke(messages)
        if not resp.tool_calls:
            break
        messages.append(resp)
        for tc in resp.tool_calls:
            result = await execute_server_tool(tc["name"], tc["args"], user_id)
            from langchain_core.messages import ToolMessage
            messages.append(ToolMessage(content=result, tool_call_id=tc["id"]))


async def run_daily_digest() -> None:
    """Scan all users and run digest for those with yesterday's daily notes."""
    from app.models.base import AsyncSessionLocal
    from app.models.llm_config import LLMConfig
    from app.models.user import User
    from sqlalchemy import select

    yesterday = (date.today() - timedelta(days=1)).isoformat()

    # Get a global default LLM config for the digest job
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id.is_(None),
                LLMConfig.is_default.is_(True),
                LLMConfig.deleted_at.is_(None),
            )
        )
        llm_config = result.scalar_one_or_none()
        if not llm_config:
            logger.warning("Daily digest: no global default LLM config found, skipping")
            return

        # Get all active users
        users_result = await db.execute(
            select(User).where(User.deleted_at.is_(None))
        )
        users = list(users_result.scalars().all())

    for user in users:
        try:
            user_dir = os.path.join(settings.MEMORY_FILES_DIR, user.id)
            daily_path = os.path.join(user_dir, f"{yesterday}.md")
            if not os.path.isfile(daily_path):
                continue
            with open(daily_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if not content:
                continue

            logger.info("Daily digest: processing user %s for %s", user.id, yesterday)
            await _run_digest_for_user(user.id, content, llm_config)
        except Exception:
            logger.exception("Daily digest failed for user %s", user.id)


async def _daily_digest_loop() -> None:
    """Asyncio loop that fires run_daily_digest at UTC 18:00 daily."""
    import datetime as dt

    while True:
        now = dt.datetime.now(dt.timezone.utc)
        # Next run at 18:00 UTC today or tomorrow
        target = now.replace(hour=18, minute=0, second=0, microsecond=0)
        if now >= target:
            target += dt.timedelta(days=1)
        wait_seconds = (target - now).total_seconds()
        logger.info("Daily digest: next run at %s (in %.0f seconds)", target.isoformat(), wait_seconds)
        await asyncio.sleep(wait_seconds)
        try:
            await run_daily_digest()
        except Exception:
            logger.exception("Daily digest loop error")


def start_daily_digest_background() -> None:
    """Start the daily digest background loop. Call from startup."""
    asyncio.get_event_loop().create_task(_daily_digest_loop())
    logger.info("Daily digest background loop started")
