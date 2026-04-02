from enum import Enum

from sqlalchemy import ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class OrgRole(str, Enum):
    viewer = "viewer"
    operator = "operator"
    manager = "manager"
    admin = "admin"


ORG_ROLE_LEVEL: dict[str, int] = {
    "viewer": 10,
    "operator": 20,
    "manager": 30,
    "admin": 40,
}


class OrgMembership(BaseModel):
    __tablename__ = "org_memberships"
    __table_args__ = (
        Index("uq_org_membership", "user_id", "org_id",
              unique=True, postgresql_where=text("deleted_at IS NULL")),
    )

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), default=OrgRole.viewer, nullable=False)
    job_title: Mapped[str | None] = mapped_column(String(32), nullable=True)

    user = relationship("User", back_populates="memberships")
    organization = relationship("Organization", back_populates="memberships")
