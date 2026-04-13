from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.exceptions import UnauthorizedError

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: str) -> str:
    return _create_token(
        {"sub": user_id, "type": "access"},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: str) -> str:
    return _create_token(
        {"sub": user_id, "type": "refresh"},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str, expected_type: str = "access") -> str:
    """Decode a JWT token and return the user_id (sub). Raises UnauthorizedError on failure."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != expected_type:
            raise UnauthorizedError("Invalid token type")
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise UnauthorizedError("Invalid token payload")
        return user_id
    except JWTError:
        raise UnauthorizedError("Could not validate credentials")


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt an LLM API key using Fernet symmetric encryption."""
    from cryptography.fernet import Fernet
    import base64

    key = settings.LLM_API_KEY_ENCRYPTION_KEY.encode()[:32]
    key = base64.urlsafe_b64encode(key.ljust(32, b"="))
    f = Fernet(key)
    return f.encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    from cryptography.fernet import Fernet
    import base64

    key = settings.LLM_API_KEY_ENCRYPTION_KEY.encode()[:32]
    key = base64.urlsafe_b64encode(key.ljust(32, b"="))
    f = Fernet(key)
    return f.decrypt(ciphertext.encode()).decode()
