import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_admin
from app.core.exceptions import NotFoundError, ForbiddenError
from app.core.security import encrypt_api_key
from app.models.llm_config import LLMConfig
from app.models.user import User
from app.schemas.llm_config import LLMConfigCreate, LLMConfigResponse, LLMConfigUpdate, LLMConfigTestRequest

router = APIRouter(tags=["llm-configs"])


# ── Test connection ────────────────────────────────────────────────────────
@router.post("/llm-configs/test")
async def test_llm_connection(
    body: LLMConfigTestRequest,
    _: User = Depends(get_current_user),
):
    """Test a LLM config by sending a minimal message and measuring latency.
    The api_key is used only for this request and never stored."""
    import time
    from langchain_core.messages import HumanMessage

    start = time.time()
    try:
        provider = (body.provider or "openai").lower()
        api_key = body.api_key

        if provider == "anthropic":
            from langchain_anthropic import ChatAnthropic  # type: ignore[import-untyped]
            model = ChatAnthropic(model=body.model, api_key=api_key, temperature=0.7, streaming=False)  # type: ignore[call-arg]
        elif provider in ("gemini", "google"):
            from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore[import-untyped]
            model = ChatGoogleGenerativeAI(model=body.model, google_api_key=api_key, temperature=0.7)  # type: ignore[call-arg]
        else:
            from langchain_openai import ChatOpenAI  # type: ignore[import-untyped]
            kwargs: dict = {"model": body.model, "api_key": api_key, "temperature": 0.7, "streaming": False}
            if body.base_url:
                kwargs["base_url"] = body.base_url
            model = ChatOpenAI(**kwargs)  # type: ignore[call-arg]

        await model.ainvoke([HumanMessage(content="hi")])
        latency_ms = int((time.time() - start) * 1000)
        return {"ok": True, "latency_ms": latency_ms}
    except Exception as exc:
        return {"ok": False, "latency_ms": None, "error": str(exc)}


# ── Public: list global (admin-managed) configs ────────────────────────────
@router.get("/llm-configs", response_model=list[LLMConfigResponse])
async def list_llm_configs(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List global configs only (no API keys returned)."""
    result = await db.execute(
        select(LLMConfig)
        .where(LLMConfig.owner_id.is_(None), LLMConfig.deleted_at.is_(None))
        .order_by(LLMConfig.is_default.desc())
    )
    return result.scalars().all()


# ── User: personal LLM configs (no admin required) ────────────────────────

@router.get("/user/llm-configs", response_model=list[LLMConfigResponse])
async def list_my_llm_configs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the calling user's personal LLM configs."""
    result = await db.execute(
        select(LLMConfig)
        .where(LLMConfig.owner_id == current_user.id, LLMConfig.deleted_at.is_(None))
        .order_by(LLMConfig.is_default.desc())
    )
    return result.scalars().all()


@router.post("/user/llm-configs", response_model=LLMConfigResponse, status_code=201)
async def create_my_llm_config(
    body: LLMConfigCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a personal LLM config bound to the calling user."""
    # If this is marked as default, clear other personal defaults for this user
    if body.is_default:
        existing = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id == current_user.id,
                LLMConfig.is_default == True,
                LLMConfig.deleted_at.is_(None),
            )
        )
        for cfg in existing.scalars().all():
            cfg.is_default = False

    config = LLMConfig(
        id=str(uuid.uuid4()),
        provider=body.provider,
        name=body.name,
        model=body.model,
        api_key_encrypted=encrypt_api_key(body.api_key),
        base_url=body.base_url,
        is_default=body.is_default,
        context_limit=body.context_limit,
        temperature=body.temperature,
        owner_id=current_user.id,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/user/llm-configs/{config_id}", response_model=LLMConfigResponse)
async def update_my_llm_config(
    config_id: str,
    body: LLMConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a personal LLM config. Users can only update their own configs."""
    result = await db.execute(
        select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.deleted_at.is_(None))
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError("LLM config not found")
    if config.owner_id != current_user.id:
        raise ForbiddenError("You can only update your own LLM configs")

    if body.name is not None:
        config.name = body.name
    if body.model is not None:
        config.model = body.model
    if body.api_key is not None:
        config.api_key_encrypted = encrypt_api_key(body.api_key)
    if body.base_url is not None:
        config.base_url = body.base_url
    if body.context_limit is not None:
        config.context_limit = body.context_limit
    if body.temperature is not None:
        config.temperature = body.temperature
    if body.is_default is not None:
        if body.is_default:
            # clear other personal defaults for this user
            existing = await db.execute(
                select(LLMConfig).where(
                    LLMConfig.owner_id == current_user.id,
                    LLMConfig.is_default == True,
                    LLMConfig.deleted_at.is_(None),
                )
            )
            for cfg in existing.scalars().all():
                cfg.is_default = False
        config.is_default = body.is_default

    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/user/llm-configs/{config_id}", status_code=204)
async def delete_my_llm_config(
    config_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a personal LLM config. Users can only delete their own configs."""
    from datetime import datetime, timezone
    result = await db.execute(
        select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.deleted_at.is_(None))
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError("LLM config not found")
    if config.owner_id != current_user.id:
        raise ForbiddenError("You can only delete your own LLM configs")
    config.deleted_at = datetime.now(timezone.utc)
    await db.commit()


# ── Admin: global LLM configs ──────────────────────────────────────────────

@router.post("/admin/llm-configs", response_model=LLMConfigResponse, status_code=201)
async def create_llm_config(
    body: LLMConfigCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: create a global LLM config (owner_id = None)."""
    config = LLMConfig(
        id=str(uuid.uuid4()),
        provider=body.provider,
        name=body.name,
        model=body.model,
        api_key_encrypted=encrypt_api_key(body.api_key),
        base_url=body.base_url,
        is_default=body.is_default,
        context_limit=body.context_limit,
        temperature=body.temperature,
        owner_id=None,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/admin/llm-configs/{config_id}", response_model=LLMConfigResponse)
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
    if body.context_limit is not None:
        config.context_limit = body.context_limit
    if body.temperature is not None:
        config.temperature = body.temperature

    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/admin/llm-configs/{config_id}", status_code=204)
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



@router.get("/llm-configs", response_model=list[LLMConfigResponse])
async def list_llm_configs(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Public: list available configs (no API keys returned)."""
    result = await db.execute(
        select(LLMConfig).where(LLMConfig.deleted_at.is_(None)).order_by(LLMConfig.is_default.desc())
    )
    return result.scalars().all()


@router.post("/admin/llm-configs", response_model=LLMConfigResponse, status_code=201)
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
        temperature=body.temperature,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/admin/llm-configs/{config_id}", response_model=LLMConfigResponse)
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
    if body.context_limit is not None:
        config.context_limit = body.context_limit
    if body.temperature is not None:
        config.temperature = body.temperature

    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/admin/llm-configs/{config_id}", status_code=204)
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
