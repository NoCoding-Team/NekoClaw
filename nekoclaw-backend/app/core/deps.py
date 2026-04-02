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


async def require_org_member(
    db: AsyncSession = Depends(get_db),
    user=Depends(_get_current_user_dep()),
):
    from app.models.org_membership import OrgMembership

    if not user.current_org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": 40010,
                "message_key": "errors.org.user_has_no_org",
                "message": "用户未加入任何猫舍",
            },
        )

    result = await db.execute(
        select(OrgMembership).where(
            OrgMembership.user_id == user.id,
            OrgMembership.org_id == user.current_org_id,
            OrgMembership.deleted_at.is_(None),
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": 40311,
                "message_key": "errors.org.not_a_member",
                "message": "你不是该猫舍的成员",
            },
        )
    return user, membership


def require_org_role(min_role: str):
    from app.models.org_membership import ORG_ROLE_LEVEL

    async def _check(
        db: AsyncSession = Depends(get_db),
        user=Depends(_get_current_user_dep()),
    ):
        from app.models.org_membership import OrgMembership

        if not user.current_org_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error_code": 40010,
                    "message_key": "errors.org.user_has_no_org",
                    "message": "用户未加入任何猫舍",
                },
            )

        result = await db.execute(
            select(OrgMembership).where(
                OrgMembership.user_id == user.id,
                OrgMembership.org_id == user.current_org_id,
                OrgMembership.deleted_at.is_(None),
            )
        )
        membership = result.scalar_one_or_none()
        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error_code": 40311,
                    "message_key": "errors.org.not_a_member",
                    "message": "你不是该猫舍的成员",
                },
            )

        user_level = ORG_ROLE_LEVEL.get(membership.role, 0)
        required_level = ORG_ROLE_LEVEL.get(min_role, 999)
        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error_code": 40312,
                    "message_key": "errors.org.insufficient_role",
                    "message": f"至少需要 {min_role} 角色",
                },
            )
        return user, membership

    return _check


def require_org_admin():
    return require_org_role("admin")


def require_org_manager():
    return require_org_role("manager")


def require_org_operator():
    return require_org_role("operator")
