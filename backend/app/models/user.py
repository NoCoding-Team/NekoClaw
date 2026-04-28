import uuid
from sqlalchemy import String, Boolean, Text, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class User(BaseModel):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("username", "deleted_at", name="uq_users_username_active"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(128), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    avatar_data: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # -1 means unlimited
    daily_message_limit: Mapped[int] = mapped_column(Integer, default=100, nullable=False, server_default="100")
    daily_creation_limit: Mapped[int] = mapped_column(Integer, default=50, nullable=False, server_default="50")
