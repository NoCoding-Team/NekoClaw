from datetime import date

from sqlalchemy import String, Integer, Date, ForeignKey, PrimaryKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class UserDailyUsage(BaseModel):
    __tablename__ = "user_daily_usage"
    __table_args__ = (
        PrimaryKeyConstraint("user_id", "date"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    messages_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    creation_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
