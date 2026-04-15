from pydantic import BaseModel as PydanticBase
from datetime import datetime


class MemoryCreate(PydanticBase):
    category: str = "general"
    content: str
    source_session_id: str | None = None


class MemoryUpdate(PydanticBase):
    category: str | None = None
    content: str | None = None
    version: int | None = None  # 乐观锁：客户端必须传入当前版本号


class MemoryResponse(PydanticBase):
    id: str
    user_id: str
    category: str
    content: str
    source_session_id: str | None
    created_at: datetime
    updated_at: datetime
    version: int

    model_config = {"from_attributes": True}
