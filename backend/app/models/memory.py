import uuid
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class Memory(BaseModel):
    __tablename__ = "memories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="general")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_session_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
