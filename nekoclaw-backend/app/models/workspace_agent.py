from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class WorkspaceAgent(BaseModel):
    __tablename__ = "workspace_agents"

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    instance_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("instances.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    hex_q: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hex_r: Mapped[int | None] = mapped_column(Integer, nullable=True)
    channel_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    channel_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    workspace = relationship("Workspace")
    instance = relationship("Instance")
