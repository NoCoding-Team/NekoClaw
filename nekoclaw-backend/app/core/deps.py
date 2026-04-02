from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.feature_gate import feature_gate

_connect_args: dict = {"ssl": False}
if settings.DATABASE_NAME_SUFFIX:
    _connect_args["server_settings"] = {"search_path": "nekoclaw, public"}

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=_connect_args,
    pool_pre_ping=True,
    pool_recycle=300,
)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


def _get_current_user_dep():
    from app.core.security import get_current_user
    return get_current_user


def _get_current_user_or_agent_dep():
    from app.core.security import get_current_user_or_agent
    return get_current_user_or_agent


async def get_current_org(
    db: AsyncSession = Depends(get_db),
    user=Depends(_get_current_user_dep()),
):
    from app.services.org.factory import get_org_provider

    provider = get_org_provider()
    org = await provider.resolve_org_for_user(user, db)

    if org is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": 40010,
                "message_key": "errors.org.user_has_no_org",
                "message": "用户未加入任何猫舍",
            },
        )
    return user, org


async def get_current_org_or_agent(
    db: AsyncSession = Depends(get_db),
    user=Depends(_get_current_user_or_agent_dep()),
):
    from app.services.org.factory import get_org_provider

    provider = get_org_provider()
    org = await provider.resolve_org_for_user(user, db)

    if org is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": 40010,
                "message_key": "errors.org.user_has_no_org",
                "message": "用户未加入任何猫舍",
            },
        )
    return user, org


async def require_super_admin_dep(
    user=Depends(_get_current_user_dep()),
):
    if not user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": 40310,
                "message_key": "errors.org.super_admin_required",
                "message": "仅限平台管理员操作",
            },
        )
    return user
