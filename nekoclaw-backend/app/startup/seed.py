import hashlib
import logging
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

_DEFAULT_PASSWORD = "Admin@nekoclaw1"


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}${dk.hex()}"


async def seed_admin(db: AsyncSession) -> None:
    account = settings.INIT_ADMIN_ACCOUNT.strip()
    if not account:
        return

    result = await db.execute(
        select(User).where(User.username == account, User.deleted_at.is_(None))
    )
    existing = result.scalar_one_or_none()

    if existing is not None:
        if settings.RESET_ADMIN_PASSWORD:
            existing.password_hash = _hash_password(_DEFAULT_PASSWORD)
            existing.must_change_password = True
            await db.commit()
            logger.info("超管密码已重置: %s", account)
        else:
            logger.info("超管账号已存在，跳过初始化: %s", account)
        return

    user = User(
        name=account,
        username=account,
        password_hash=_hash_password(_DEFAULT_PASSWORD),
        role=UserRole.admin,
        is_super_admin=True,
        must_change_password=True,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    logger.info("超管账号已创建: %s  初始密码: %s", account, _DEFAULT_PASSWORD)
