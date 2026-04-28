from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── User management ────────────────────────────────────────────────────────

class AdminUserResponse(BaseModel):
    id: str
    username: str
    nickname: Optional[str] = None
    is_admin: bool
    daily_message_limit: int
    daily_creation_limit: int
    messages_used_today: int = 0
    creation_used_today: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminCreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    nickname: Optional[str] = Field(default=None, max_length=64)
    is_admin: bool = False


class AdminUpdateUserRequest(BaseModel):
    nickname: Optional[str] = Field(default=None, max_length=64)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    is_admin: Optional[bool] = None


class AdminQuotaRequest(BaseModel):
    daily_message_limit: Optional[int] = None  # -1 = unlimited
    daily_creation_limit: Optional[int] = None  # -1 = unlimited


# ── Stats ──────────────────────────────────────────────────────────────────

class AdminStatsResponse(BaseModel):
    total_users: int
    active_users_today: int
    total_messages_today: int
    total_creation_today: int


# ── Skills ─────────────────────────────────────────────────────────────────

class AdminSkillResponse(BaseModel):
    name: str
    description: str
    author: str
    version: str
    default_enabled: bool
    triggers: list[str] = []
    requires_tools: list[str] = []


class AdminSkillUpdateRequest(BaseModel):
    default_enabled: bool
