from sqlalchemy import String, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class ToolConfig(BaseModel):
    __tablename__ = "tool_configs"

    tool_name: Mapped[str] = mapped_column(String(64), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    credentials: Mapped[str | None] = mapped_column(Text, nullable=True)  # Fernet-encrypted JSON
