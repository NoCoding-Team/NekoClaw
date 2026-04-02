from sqlalchemy import ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class UserOAuthConnection(BaseModel):
    __tablename__ = "user_oauth_connections"
    __table_args__ = (
        Index("uq_oauth_provider_user", "provider", "provider_user_id",
              unique=True, postgresql_where=text("deleted_at IS NULL")),
    )

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    provider_user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    provider_tenant_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    user = relationship("User", back_populates="oauth_connections")


class OrgOAuthBinding(BaseModel):
    __tablename__ = "org_oauth_bindings"
    __table_args__ = (
        Index("uq_org_oauth_binding", "provider", "provider_tenant_id",
              unique=True, postgresql_where=text("deleted_at IS NULL")),
    )

    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_tenant_id: Mapped[str] = mapped_column(String(128), nullable=False)

    organization = relationship("Organization", back_populates="oauth_bindings")
