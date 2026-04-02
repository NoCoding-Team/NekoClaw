from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class Blackboard(BaseModel):
    __tablename__ = "blackboards"

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, unique=True,
    )
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)

    workspace = relationship("Workspace", back_populates="blackboard")
    posts = relationship("BlackboardPost", back_populates="blackboard", cascade="all, delete-orphan")


class BlackboardPost(BaseModel):
    __tablename__ = "blackboard_posts"

    blackboard_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("blackboards.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    blackboard = relationship("Blackboard", back_populates="posts")
    author = relationship("User", foreign_keys=[author_id])
    replies = relationship("BlackboardReply", back_populates="post", cascade="all, delete-orphan")


class BlackboardReply(BaseModel):
    __tablename__ = "blackboard_replies"

    post_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("blackboard_posts.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    post = relationship("BlackboardPost", back_populates="replies")
    author = relationship("User", foreign_keys=[author_id])
