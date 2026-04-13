import uuid
from sqlalchemy import String, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class LLMConfig(BaseModel):
    __tablename__ = "llm_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider: Mapped[str] = mapped_column(String(64), nullable=False)   # openai | anthropic | gemini | custom
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)  # for custom providers
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    context_limit: Mapped[int] = mapped_column(default=128000, nullable=False)
