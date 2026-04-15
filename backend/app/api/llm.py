"""
LLM utility endpoints.

Provides server-side assistance for Mode B (custom key) clients:
  - POST /api/llm/enhance  — inject memory + skill prompt into messages[]
"""
from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel as PydanticBase

from app.core.deps import get_current_user
from app.models.user import User
from app.services.llm import _build_system_prompt
from app.models.skill import Skill
from app.models.base import AsyncSessionLocal

router = APIRouter(prefix="/llm", tags=["llm"])


class EnhanceRequest(PydanticBase):
    messages: list[dict[str, Any]]
    skill_id: str | None = None


class EnhanceResponse(PydanticBase):
    messages: list[dict[str, Any]]


@router.post("/enhance", response_model=EnhanceResponse)
async def enhance_messages(
    payload: EnhanceRequest,
    current_user: User = Depends(get_current_user),
):
    """
    模式 B 增强端点：客户端传入当前 messages[]，服务端注入记忆/技能系统提示后返回。
    客户端拿到增强后的 messages[] 再直接调用 LLM API，实现记忆注入而不暴露 API Key。
    """
    # Load skill if requested
    skill = None
    if payload.skill_id:
        async with AsyncSessionLocal() as db:
            skill = await db.get(Skill, payload.skill_id)

    # Build enhanced system prompt (includes memory injection)
    system_prompt = await _build_system_prompt(current_user.id, skill)

    # Replace any existing system messages, then prepend the enhanced one
    non_system = [m for m in payload.messages if m.get("role") != "system"]
    enhanced = [{"role": "system", "content": system_prompt}, *non_system]

    return EnhanceResponse(messages=enhanced)
