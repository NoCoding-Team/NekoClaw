from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ScheduledTaskCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: str
    schedule_type: str = Field("once", pattern="^(once|cron)$")
    cron_expr: Optional[str] = None
    run_at: Optional[datetime] = None
    timezone: str = Field("UTC", max_length=64)
    skill_id: Optional[str] = None
    allowed_tools: list[str] = Field(default_factory=list)
    is_enabled: bool = True

    model_config = {"from_attributes": True}


class ScheduledTaskUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    schedule_type: Optional[str] = Field(None, pattern="^(once|cron)$")
    cron_expr: Optional[str] = None
    run_at: Optional[datetime] = None
    timezone: Optional[str] = Field(None, max_length=64)
    skill_id: Optional[str] = None
    allowed_tools: Optional[list[str]] = None
    is_enabled: Optional[bool] = None


class ScheduledTaskOut(BaseModel):
    id: str
    user_id: str
    title: str
    description: str
    schedule_type: str
    cron_expr: Optional[str]
    run_at: Optional[datetime]
    timezone: str
    skill_id: Optional[str]
    allowed_tools: list[str]
    is_enabled: bool
    status: str
    last_status: Optional[str]
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    run_count: int
    missed_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ScheduledTaskRunCreate(BaseModel):
    scheduled_for: Optional[datetime] = None
    trigger_type: str = Field("auto", pattern="^(auto|manual|missed)$")
    status: str = Field("running", pattern="^(running|missed)$")


class InferToolsRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=2000)


class InferToolsResponse(BaseModel):
    allowed_tools: list[str]
    skill_id: Optional[str]
    reasoning: str


class ScheduledTaskRunUpdate(BaseModel):
    status: str = Field(..., pattern="^(running|success|failed|missed|ignored|cancelled)$")
    session_id: Optional[str] = None
    error_message: Optional[str] = None
    summary: Optional[str] = None


class ScheduledTaskRunOut(BaseModel):
    id: str
    task_id: str
    user_id: str
    scheduled_for: Optional[datetime]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    status: str
    trigger_type: str
    session_id: Optional[str]
    allowed_tools_snapshot: list[str]
    error_message: Optional[str]
    summary: Optional[str]
    duration_ms: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}
