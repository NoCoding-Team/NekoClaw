from pydantic import BaseModel


class SkillInfo(BaseModel):
    key: str            # directory name — used as stable API identifier
    name: str           # display name from frontmatter
    description: str
    version: str = "1.0"
    author: str = "system"
    source: str = "builtin"  # "builtin" | "user"
    enabled: bool = True
    triggers: list[str] = []


class SkillToggle(BaseModel):
    enabled: bool
