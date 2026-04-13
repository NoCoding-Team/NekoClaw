import uuid
from sqlalchemy import String, Boolean, Integer, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import BaseModel


class ScheduledTask(BaseModel):
    __tablename__ = "scheduled_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    cron_expr: Mapped[str | None] = mapped_column(String(100), nullable=True)
    run_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    skill_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_run_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user = relationship("User", backref="scheduled_tasks")
