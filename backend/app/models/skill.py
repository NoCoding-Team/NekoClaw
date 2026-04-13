import uuid
from sqlalchemy import String, Boolean, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from typing import Any

from app.models.base import BaseModel


class Skill(BaseModel):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[str] = mapped_column(String(16), nullable=False, default="⚡")
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    allowed_tools: Mapped[Any] = mapped_column(JSON, nullable=False, default=list)  # list[str]
    sandbox_level: Mapped[str] = mapped_column(String(8), nullable=False, default="LOW")  # LOW|MEDIUM|HIGH
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    owner_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # null = global builtin
