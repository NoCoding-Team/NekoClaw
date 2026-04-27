from datetime import datetime
from pydantic import BaseModel


class SessionCreate(BaseModel):
    title: str = "新对话"
    source: str = "chat"
    memory_policy: str = "auto"


class SessionResponse(BaseModel):
    id: str
    title: str
    source: str = "chat"
    memory_policy: str = "auto"
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str | None
    tool_calls: list | None
    tool_call_id: str | None = None
    seq: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    role: str   # 'user' | 'assistant' | 'tool'
    content: str = ''
    tool_calls: list | None = None
    created_at: datetime | None = None  # 批量同步时携带原始时间戳，保证顺序


class SessionUpdate(BaseModel):
    title: str


class GenerateTitleRequest(BaseModel):
    user_message: str
    ai_reply: str
    custom_llm_config: dict | None = None
