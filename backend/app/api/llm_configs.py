import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_admin
from app.core.exceptions import NotFoundError
from app.core.security import encrypt_api_key
from app.models.llm_config import LLMConfig
from app.models.user import User
from app.schemas.llm_config import LLMConfigCreate, LLMConfigResponse, LLMConfigUpdate

router = APIRouter(tags=["llm-configs"])


@router.get("/api/llm-configs", response_model=list[LLMConfigResponse])
async def list_llm_configs(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Public: list available configs (no API keys returned)."""
    result = await db.execute(
        select(LLMConfig).where(LLMConfig.deleted_at.is_(None)).order_by(LLMConfig.is_default.desc())
    )
    return result.scalars().all()


@router.post("/api/admin/llm-configs", response_model=LLMConfigResponse, status_code=201)
async def create_llm_config(
    body: LLMConfigCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    config = LLMConfig(
        id=str(uuid.uuid4()),
        provider=body.provider,
        name=body.name,
        model=body.model,
        api_key_encrypted=encrypt_api_key(body.api_key),
        base_url=body.base_url,
        is_default=body.is_default,
        context_limit=body.context_limit,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/api/admin/llm-configs/{config_id}", response_model=LLMConfigResponse)
async def update_llm_config(
    config_id: str,
    body: LLMConfigUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.deleted_at.is_(None))
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError("LLM config not found")

    if body.name is not None:
        config.name = body.name
    if body.model is not None:
        config.model = body.model
    if body.api_key is not None:
        config.api_key_encrypted = encrypt_api_key(body.api_key)
    if body.base_url is not None:
        config.base_url = body.base_url
    if body.is_default is not None:
        config.is_default = body.is_default

    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/api/admin/llm-configs/{config_id}", status_code=204)
async def delete_llm_config(
    config_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    result = await db.execute(
        select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.deleted_at.is_(None))
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError("LLM config not found")
    config.deleted_at = datetime.now(timezone.utc)
    await db.commit()
