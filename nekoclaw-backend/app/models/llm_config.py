import uuid

from sqlalchemy import BigInteger, Boolean, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class OrgLlmKey(BaseModel):
    __tablename__ = "org_llm_keys"

    org_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), default="")
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    org_token_limit: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    system_token_limit: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserLlmKey(BaseModel):
    __tablename__ = "user_llm_keys"

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)


class UserLlmConfig(BaseModel):
    __tablename__ = "user_llm_configs"

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    key_source: Mapped[str] = mapped_column(String(16), nullable=False, default="personal")


class LlmUsageLog(BaseModel):
    __tablename__ = "llm_usage_logs"

    org_llm_key_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    instance_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    org_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(default=0)
    completion_tokens: Mapped[int] = mapped_column(default=0)
    total_tokens: Mapped[int] = mapped_column(default=0)
    key_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    request_path: Mapped[str | None] = mapped_column(String(256), nullable=True)
    is_stream: Mapped[bool] = mapped_column(Boolean, default=False)
    status_code: Mapped[int | None] = mapped_column(nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(512), nullable=True)
    request_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
