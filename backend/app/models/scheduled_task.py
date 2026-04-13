from sqlalchemy import Column, String, Boolean, Integer, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from .base import BaseModel


class ScheduledTask(BaseModel):
    __tablename__ = "scheduled_tasks"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)        # 触发时发送给 AI 的消息
    cron_expr = Column(String(100), nullable=True)    # cron 表达式，None 表示一次性
    run_at = Column(DateTime(timezone=True), nullable=True)  # 一次性任务的执行时间
    skill_id = Column(String(100), nullable=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    run_count = Column(Integer, default=0, nullable=False)

    user = relationship("User", backref="scheduled_tasks")
