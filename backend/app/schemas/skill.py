from pydantic import BaseModel


class SkillCreate(BaseModel):
    name: str
    icon: str = "⚡"
    system_prompt: str
    allowed_tools: list[str] = []
    sandbox_level: str = "LOW"


class SkillUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    system_prompt: str | None = None
    allowed_tools: list[str] | None = None
    sandbox_level: str | None = None


class SkillResponse(BaseModel):
    id: str
    name: str
    icon: str
    system_prompt: str
    allowed_tools: list[str]
    sandbox_level: str
    is_builtin: bool
    owner_id: str | None

    model_config = {"from_attributes": True}
