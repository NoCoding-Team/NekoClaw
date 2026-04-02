from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class Organization(BaseModel):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)

    plan: Mapped[str] = mapped_column(String(32), default="free", nullable=False)
    max_instances: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_cpu_total: Mapped[str] = mapped_column(String(16), default="4", nullable=False)
    max_mem_total: Mapped[str] = mapped_column(String(16), default="8Gi", nullable=False)
    max_storage_total: Mapped[str] = mapped_column(String(16), default="500Gi", nullable=False)

    cluster_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("clusters.id"), nullable=True
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    memberships = relationship("OrgMembership", back_populates="organization", cascade="all, delete-orphan")
    oauth_bindings = relationship("OrgOAuthBinding", back_populates="organization", cascade="all, delete-orphan")
