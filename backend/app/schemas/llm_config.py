from pydantic import BaseModel, Field


class LLMConfigCreate(BaseModel):
    provider: str
    name: str
    model: str
    api_key: str  # plaintext, will be encrypted before storage
    base_url: str | None = None
    is_default: bool = False
    context_limit: int = 128000
    temperature: float = 0.7


class LLMConfigUpdate(BaseModel):
    provider: str | None = None
    name: str | None = None
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    is_default: bool | None = None
    context_limit: int | None = None
    temperature: float | None = None


class LLMConfigTestRequest(BaseModel):
    provider: str = "openai"
    model: str
    api_key: str
    base_url: str | None = None


class LLMConfigResponse(BaseModel):
    id: str
    provider: str
    name: str
    model: str
    base_url: str | None
    is_default: bool
    context_limit: int
    temperature: float
    owner_id: str | None = None  # None = global config; user_id = personal config
    # api_key intentionally omitted

    model_config = {"from_attributes": True}
