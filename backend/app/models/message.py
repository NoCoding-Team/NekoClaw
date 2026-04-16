import uuid
from sqlalchemy import String, ForeignKey, Text, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column
from typing import Any

from app.models.base import BaseModel


class Message(BaseModel):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user | assistant | tool
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    tool_calls: Mapped[Any | None] = mapped_column(JSON, nullable=True)  # serialized tool call list
    tool_call_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # OpenAI tool_call_id for role='tool'
    token_count: Mapped[int] = mapped_column(default=0, nullable=False)
    seq: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # deterministic ordering within session
