from datetime import datetime

from pydantic import BaseModel, Field


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = ""
    color: str = "#a78bfa"
    icon: str = "cat"


class WorkspaceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    icon: str | None = None


class AgentBrief(BaseModel):
    instance_id: str
    name: str
    display_name: str | None = None
    slug: str | None = None
    status: str
    hex_q: int | None = None
    hex_r: int | None = None
    cat_state: str | None = None
    theme_color: str | None = None


class WorkspaceInfo(BaseModel):
    id: str
    org_id: str
    name: str
    description: str
    color: str
    icon: str
    created_by: str
    agent_count: int = 0
    agents: list[AgentBrief] = []
    created_at: datetime
    updated_at: datetime


class WorkspaceListItem(BaseModel):
    id: str
    name: str
    description: str
    color: str
    icon: str
    agent_count: int = 0
    agents: list[AgentBrief] = []
    created_at: datetime


class ObjectiveCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    description: str | None = None
    obj_type: str = "objective"
    parent_id: str | None = None


class ObjectiveUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    progress: float | None = None
    obj_type: str | None = None
    parent_id: str | None = None


class ObjectiveInfo(BaseModel):
    id: str
    workspace_id: str
    title: str
    description: str | None = None
    progress: float = 0.0
    obj_type: str = "objective"
    parent_id: str | None = None
    children: list["ObjectiveInfo"] = []
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class BlackboardInfo(BaseModel):
    id: str
    workspace_id: str
    content: str
    objectives: list[ObjectiveInfo] = []
    updated_at: datetime


class BlackboardUpdate(BaseModel):
    content: str


class PostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    content: str = Field(min_length=1)


class PostUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=256)
    content: str | None = Field(None, min_length=1)


class ReplyCreate(BaseModel):
    content: str = Field(min_length=1)


class ReplyInfo(BaseModel):
    id: str
    post_id: str
    content: str
    author_id: str
    author_name: str
    created_at: datetime


class PostInfo(BaseModel):
    id: str
    blackboard_id: str
    title: str
    content: str
    author_id: str
    author_name: str
    reply_count: int = 0
    replies: list[ReplyInfo] = []
    created_at: datetime
    updated_at: datetime


class PostListItem(BaseModel):
    id: str
    blackboard_id: str
    title: str
    author_id: str
    author_name: str
    reply_count: int = 0
    created_at: datetime


class AddAgentRequest(BaseModel):
    instance_id: str
    hex_q: int | None = None
    hex_r: int | None = None


class UpdateAgentRequest(BaseModel):
    hex_q: int | None = None
    hex_r: int | None = None
    channel_type: str | None = None


class WorkspaceAgentInfo(BaseModel):
    id: str
    workspace_id: str
    instance_id: str
    instance_name: str | None = None
    hex_q: int | None = None
    hex_r: int | None = None
    channel_type: str | None = None
    cat_state: str | None = None
    created_at: datetime


class WorkspaceMemberAdd(BaseModel):
    user_id: str
    role: str = "editor"
    is_admin: bool = False


class WorkspaceMemberUpdate(BaseModel):
    role: str | None = None
    is_admin: bool | None = None


class WorkspaceMemberInfo(BaseModel):
    user_id: str
    user_name: str
    user_email: str | None = None
    role: str
    is_admin: bool = False
    hex_q: int | None = None
    hex_r: int | None = None
    display_color: str | None = None
    created_at: datetime


class WorkspaceMessageInfo(BaseModel):
    id: str
    workspace_id: str
    sender_type: str
    sender_id: str
    sender_name: str
    content: str
    message_type: str
    target_instance_id: str | None = None
    depth: int = 0
    created_at: datetime


class WorkspaceChatRequest(BaseModel):
    message: str
    mentions: list[str] | None = None


class TopologyNode(BaseModel):
    node_type: str
    node_id: str
    name: str
    hex_q: int
    hex_r: int
    cat_state: str | None = None
    theme_color: str | None = None
    display_color: str | None = None


class TopologyInfo(BaseModel):
    workspace_id: str
    nodes: list[TopologyNode] = []
