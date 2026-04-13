from datetime import datetime
from pydantic import BaseModel


class SessionCreate(BaseModel):
    title: str = "新对话"
    skill_id: str | None = None


class SessionResponse(BaseModel):
    id: str
    title: str
    skill_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str | None
    tool_calls: list | None
    created_at: datetime

    model_config = {"from_attributes": True}
