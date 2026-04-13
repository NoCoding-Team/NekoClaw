from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ScheduledTaskCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: str
    cron_expr: Optional[str] = None
    run_at: Optional[datetime] = None
    skill_id: Optional[str] = None
    is_enabled: bool = True

    model_config = {"from_attributes": True}


class ScheduledTaskUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    cron_expr: Optional[str] = None
    run_at: Optional[datetime] = None
    skill_id: Optional[str] = None
    is_enabled: Optional[bool] = None


class ScheduledTaskOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: str
    cron_expr: Optional[str]
    run_at: Optional[datetime]
    skill_id: Optional[str]
    is_enabled: bool
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    run_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
