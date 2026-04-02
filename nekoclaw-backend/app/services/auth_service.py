import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.user import User, UserRole
from app.schemas.auth import LoginResponse, TokenResponse, UserInfo
from app.utils.oauth_providers import get_provider

logger = logging.getLogger(__name__)


async def oauth_login(
    provider_name: str, code: str, db: AsyncSession,
    redirect_uri: str | None = None, client_id: str | None = None,
) -> LoginResponse:
    from app.models.oauth_connection import OrgOAuthBinding, UserOAuthConnection
    from app.models.org_membership import OrgMembership, OrgRole

    provider = get_provider(provider_name)
    oauth_info = await provider.exchange_code(code, redirect_uri, client_id=client_id)

    conn_result = await db.execute(
        select(UserOAuthConnection).where(
            UserOAuthConnection.provider == oauth_info.provider,
            UserOAuthConnection.provider_user_id == oauth_info.provider_user_id,
            UserOAuthConnection.deleted_at.is_(None),
        )
    )
    connection = conn_result.scalar_one_or_none()

    if connection is not None:
        user_result = await db.execute(
            select(User)
            .options(selectinload(User.oauth_connections))
            .where(User.id == connection.user_id, User.deleted_at.is_(None))
        )
        user = user_result.scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error_code": 40106,
                    "message_key": "errors.auth.user_not_found_or_disabled",
                    "message": "用户不存在或已禁用",
                },
            )
        user.name = oauth_info.name
        if oauth_info.email:
            user.email = oauth_info.email
        if oauth_info.avatar_url:
            user.avatar_url = oauth_info.avatar_url
        if oauth_info.provider_tenant_id:
            connection.provider_tenant_id = oauth_info.provider_tenant_id
    else:
        user = User(
            name=oauth_info.name,
            email=oauth_info.email,
            avatar_url=oauth_info.avatar_url,
            role=UserRole.user,
        )
        db.add(user)
        await db.flush()

        connection = UserOAuthConnection(
            user_id=user.id,
            provider=oauth_info.provider,
            provider_user_id=oauth_info.provider_user_id,
            provider_tenant_id=oauth_info.provider_tenant_id,
        )
        db.add(connection)

    user.last_login_at = datetime.now(timezone.utc)

    needs_org_setup = False
    tenant_id = oauth_info.provider_tenant_id

    if tenant_id:
        binding_result = await db.execute(
            select(OrgOAuthBinding).where(
                OrgOAuthBinding.provider == oauth_info.provider,
                OrgOAuthBinding.provider_tenant_id == tenant_id,
                OrgOAuthBinding.deleted_at.is_(None),
            )
        )
        binding = binding_result.scalar_one_or_none()

        if binding is not None:
            await db.flush()
            existing = await db.execute(
                select(OrgMembership).where(
                    OrgMembership.user_id == user.id,
                    OrgMembership.org_id == binding.org_id,
                    OrgMembership.deleted_at.is_(None),
                )
            )
            if existing.scalar_one_or_none() is None:
                db.add(OrgMembership(user_id=user.id, org_id=binding.org_id, role=OrgRole.viewer))
            user.current_org_id = binding.org_id
        else:
            needs_org_setup = True
    else:
        needs_org_setup = True

    await db.commit()

    refreshed = await db.execute(
        select(User)
        .options(selectinload(User.oauth_connections))
        .where(User.id == user.id)
    )
    user = refreshed.scalar_one()

    user_info = _build_user_info(user)
    return LoginResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=user_info,
        needs_org_setup=needs_org_setup,
        provider=oauth_info.provider,
    )


async def refresh_tokens(refresh_token_str: str, db: AsyncSession) -> TokenResponse:
    payload = decode_token(refresh_token_str)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": 40102,
                "message_key": "errors.auth.token_type_invalid",
                "message": "Token 类型错误",
            },
        )

    user_id = payload.get("sub")
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": 40105,
                "message_key": "errors.auth.user_not_found_or_disabled",
                "message": "用户不存在或已禁用",
            },
        )

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}${dk.hex()}"


def _verify_password(password: str, hashed: str) -> bool:
    parts = hashed.split("$", 1)
    if len(parts) != 2:
        return False
    salt, stored_dk = parts
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return hmac.compare_digest(dk.hex(), stored_dk)


def _build_user_info(user: User) -> UserInfo:
    info = UserInfo.model_validate(user)
    info.has_password = bool(user.password_hash)
    return info


async def _issue_tokens(user: User, db: AsyncSession) -> LoginResponse:
    user_info = _build_user_info(user)
    return LoginResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=user_info,
    )


def _check_email_domain_allowed(email: str) -> None:
    raw = settings.LOGIN_EMAIL_WHITELIST.strip()
    if not raw:
        return
    allowed = [d.strip().lower() for d in raw.split(",") if d.strip()]
    if not allowed:
        return
    domain = email.rsplit("@", 1)[-1].lower()
    if domain not in allowed:
        raise HTTPException(
            status_code=403,
            detail={
                "error_code": 40330,
                "message_key": "errors.auth.email_domain_not_allowed",
                "message": "当前邮箱域名不在允许范围内",
            },
        )


async def login_with_account(account: str, password: str, db: AsyncSession) -> LoginResponse:
    if "@" in account:
        _check_email_domain_allowed(account)
        where_clause = User.email == account
    else:
        where_clause = User.username == account

    result = await db.execute(
        select(User)
        .options(selectinload(User.oauth_connections))
        .where(where_clause, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()

    if user is None or not user.password_hash:
        raise HTTPException(
            status_code=401,
            detail={
                "error_code": 40120,
                "message_key": "errors.auth.invalid_account_or_password",
                "message": "账号或密码错误",
            },
        )
    if not _verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail={
                "error_code": 40120,
                "message_key": "errors.auth.invalid_account_or_password",
                "message": "账号或密码错误",
            },
        )
    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail={
                "error_code": 40320,
                "message_key": "errors.auth.account_disabled",
                "message": "账户已被禁用",
            },
        )

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    return await _issue_tokens(user, db)


async def change_password(
    user_id: str, old_password: str | None, new_password: str, db: AsyncSession
) -> None:
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user.password_hash and not user.must_change_password:
        if not old_password:
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": 40024,
                    "message_key": "errors.auth.old_password_required",
                    "message": "请输入当前密码",
                },
            )
        if not _verify_password(old_password, user.password_hash):
            raise HTTPException(
                status_code=401,
                detail={
                    "error_code": 40121,
                    "message_key": "errors.auth.wrong_password",
                    "message": "当前密码错误",
                },
            )

    user.password_hash = _hash_password(new_password)
    user.must_change_password = False
    await db.commit()
    logger.info("密码修改: user_id=%s", user_id)


async def get_user_info(user: User, db: AsyncSession) -> UserInfo:
    return _build_user_info(user)


async def admin_reset_password(user_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error_code": 40401,
                "message_key": "errors.auth.user_not_found_or_disabled",
                "message": "用户不存在",
            },
        )

    plain = secrets.token_urlsafe(9)
    user.password_hash = _hash_password(plain)
    user.must_change_password = True
    await db.commit()
    logger.info("管理员重置密码: user_id=%s", user_id)
    return plain
