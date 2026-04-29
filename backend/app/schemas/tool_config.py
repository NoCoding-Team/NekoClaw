from pydantic import BaseModel


class ToolRequiresCredential(BaseModel):
    key: str
    label: str
    hint: str = ""


class ToolRequires(BaseModel):
    credentials: list[ToolRequiresCredential] = []
    services: list[str] = []


class ToolStatus(BaseModel):
    credentials_configured: bool
    services_available: bool
    ready: bool


class ToolConfigResponse(BaseModel):
    name: str
    category: str
    description: str
    enabled: bool
    requires: ToolRequires | None
    status: ToolStatus


class ToolConfigUpdate(BaseModel):
    enabled: bool | None = None
    credentials: dict[str, str] | None = None
