"""
Task tool inference service.

Given a task description, uses an LLM to suggest which allowed_tools and skill_id
are needed to complete the task.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_INFER_SYSTEM_PROMPT = """\
你是一个定时任务工具配置分析器。
根据用户提供的任务描述，从给定的工具列表和技能列表中，选择完成该任务所需要的工具和技能。

规则：
1. 只选择任务确实需要的工具，不要过度授权。
2. 如果某个技能的描述或触发词与任务语义高度匹配，返回该技能 ID；否则返回 null。
3. 如果选择了某个技能，必须把该技能的 requires_tools 也包含在 allowed_tools 里。
4. 输出必须是合法的 JSON，格式：{"allowed_tools": [...], "skill_id": "..." 或 null, "reasoning": "简短说明"}
5. 不要输出任何 JSON 以外的内容。\
"""


def _build_tool_list_text() -> str:
    from app.services.agent.context import _TOOL_GROUPS  # lazy: avoids heavy __init__ chain
    lines = []
    for group_tools, _ in _TOOL_GROUPS:
        lines.append(", ".join(group_tools))
    return "\n".join(f"- {line}" for line in lines)


def _build_skill_list_text(skills: dict) -> str:
    if not skills:
        return "（无可用技能）"
    lines = []
    for skill_id, meta in skills.items():
        triggers_str = "、".join(meta.triggers) if meta.triggers else ""
        requires_str = ", ".join(meta.requires_tools) if meta.requires_tools else "无"
        lines.append(
            f"- skill_id={skill_id}: {meta.description}"
            + (f"（触发词：{triggers_str}）" if triggers_str else "")
            + f"，需要工具：{requires_str}"
        )
    return "\n".join(lines)


def _parse_infer_response(text: str) -> dict[str, Any]:
    """Extract JSON from LLM response, tolerating minor formatting issues."""
    text = text.strip()
    # Strip markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


async def infer_tools_for_task(
    description: str,
    user_id: str,
    db: AsyncSession,
    client_llm: dict | None = None,
) -> dict[str, Any]:
    """Infer allowed_tools and skill_id from a task description using LLM.

    Returns dict with keys: allowed_tools (list[str]), skill_id (str|None), reasoning (str).
    Raises ValueError if LLM is unavailable or inference fails.
    """
    from sqlalchemy import select
    from app.models.llm_config import LLMConfig
    from app.services.agent.provider import get_chat_model
    from app.services.skill_loader import get_enabled_skills_for_user
    from langchain_core.messages import HumanMessage, SystemMessage

    # Get user LLM config (user default → global default)
    result = await db.execute(
        select(LLMConfig).where(
            LLMConfig.owner_id == user_id,
            LLMConfig.is_default.is_(True),
            LLMConfig.deleted_at.is_(None),
        )
    )
    llm_config = result.scalar_one_or_none()
    if not llm_config:
        result = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id.is_(None),
                LLMConfig.is_default.is_(True),
                LLMConfig.deleted_at.is_(None),
            )
        )
        llm_config = result.scalar_one_or_none()

    if not llm_config:
        if not client_llm:
            raise ValueError("没有可用的 LLM 配置")
        # Build model from client-provided config
        from types import SimpleNamespace
        from app.core.security import encrypt_api_key
        fake_config = SimpleNamespace(
            provider=client_llm.get("provider", "openai"),
            model=client_llm.get("model", ""),
            api_key_encrypted=encrypt_api_key(client_llm.get("api_key", "")),
            base_url=client_llm.get("base_url") or None,
            temperature=float(client_llm.get("temperature", 0.7)),
        )
        model = get_chat_model(fake_config)
    else:
        model = get_chat_model(llm_config)

    # Build tool & skill context
    tool_list_text = _build_tool_list_text()
    skills = await get_enabled_skills_for_user(user_id, db)
    skill_list_text = _build_skill_list_text(skills)

    user_prompt = (
        f"任务描述：{description}\n\n"
        f"可用工具组：\n{tool_list_text}\n\n"
        f"可用技能：\n{skill_list_text}"
    )

    messages = [
        SystemMessage(content=_INFER_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ]

    try:
        resp = await model.ainvoke(messages)
        content = resp.content if isinstance(resp.content, str) else str(resp.content)
        parsed = _parse_infer_response(content)
    except (json.JSONDecodeError, Exception) as exc:
        logger.warning("Tool inference LLM call failed: %s", exc)
        raise ValueError(f"工具推断失败：{exc}") from exc

    allowed_tools: list[str] = parsed.get("allowed_tools") or []
    skill_id: str | None = parsed.get("skill_id")
    reasoning: str = parsed.get("reasoning", "")

    # Validate: ensure skill's requires_tools are included
    if skill_id and skill_id in skills:
        for t in skills[skill_id].requires_tools:
            if t not in allowed_tools:
                allowed_tools.append(t)

    return {
        "allowed_tools": allowed_tools,
        "skill_id": skill_id,
        "reasoning": reasoning,
    }
