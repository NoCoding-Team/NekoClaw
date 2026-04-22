import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, PrimaryKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class SkillConfig(BaseModel):
    __tablename__ = "skills_config"
    __table_args__ = (
        PrimaryKeyConstraint("user_id", "skill_name"),
    )

    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    skill_name: Mapped[str] = mapped_column(String(128), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="builtin")  # "builtin" | "user"
