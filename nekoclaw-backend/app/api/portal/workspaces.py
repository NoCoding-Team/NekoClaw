import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_org
from app.core import hooks
from app.core.security import get_current_user
from app.core.exceptions import AppException
from app.schemas.workspace import (
    AddAgentRequest,
    BlackboardUpdate,
    ObjectiveCreate,
    ObjectiveUpdate,
    PostCreate,
    ReplyCreate,
    UpdateAgentRequest,
    WorkspaceChatRequest,
    WorkspaceCreate,
    WorkspaceMemberAdd,
    WorkspaceMemberUpdate,
    WorkspaceUpdate,
)
from app.services import workspace_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _ok(data=None, message: str = "success"):
    return {"code": 0, "message": message, "data": data}


def _dump(obj):
    return obj.model_dump(mode="json") if obj else None


# ── Workspace CRUD ───────────────────────────────────

@router.post("")
async def create_workspace(
    data: WorkspaceCreate,
    org_ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = org_ctx
    ws = await workspace_service.create_workspace(db, org.id, user.id, data)
    await hooks.emit("operation_audit", action="workspace.created", target_type="workspace", target_id=ws.id, actor_id=user.id, org_id=org.id)
    return _ok(_dump(ws))


@router.get("")
async def list_workspaces(
    org_ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = org_ctx
    items = await workspace_service.list_workspaces(db, org.id, user.id)
    return _ok([_dump(i) for i in items])


@router.get("/{workspace_id}")
async def get_workspace(
    workspace_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    ws = await workspace_service.get_workspace(db, workspace_id)
    if ws is None:
        raise AppException(status_code=404, error_code=40430, message_key="errors.workspace.not_found", message="workspace not found")
    return _ok(_dump(ws))


@router.put("/{workspace_id}")
async def update_workspace(
    workspace_id: str,
    data: WorkspaceUpdate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_admin(db, workspace_id, user.id)
    ws = await workspace_service.update_workspace(db, workspace_id, data)
    if ws is None:
        raise AppException(status_code=404, error_code=40430, message_key="errors.workspace.not_found", message="workspace not found")
    await hooks.emit("operation_audit", action="workspace.updated", target_type="workspace", target_id=workspace_id, actor_id=user.id)
    return _ok(_dump(ws))


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_admin(db, workspace_id, user.id)
    ok = await workspace_service.delete_workspace(db, workspace_id)
    if not ok:
        raise AppException(status_code=404, error_code=40430, message_key="errors.workspace.not_found", message="workspace not found")
    await hooks.emit("operation_audit", action="workspace.deleted", target_type="workspace", target_id=workspace_id, actor_id=user.id)
    return _ok(message="deleted")


# ── Agent Management ─────────────────────────────────

@router.post("/{workspace_id}/agents")
async def add_agent(
    workspace_id: str,
    data: AddAgentRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_admin(db, workspace_id, user.id)
    agent = await workspace_service.add_agent(db, workspace_id, data, user.id)
    return _ok(_dump(agent))


@router.get("/{workspace_id}/agents")
async def list_agents(
    workspace_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    agents = await workspace_service.list_agents(db, workspace_id)
    return _ok([_dump(a) for a in agents])


@router.put("/{workspace_id}/agents/{instance_id}")
async def update_agent(
    workspace_id: str,
    instance_id: str,
    data: UpdateAgentRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_admin(db, workspace_id, user.id)
    agent = await workspace_service.update_agent(db, workspace_id, instance_id, data)
    if agent is None:
        raise AppException(status_code=404, error_code=40452, message_key="errors.workspace.agent_not_found", message="agent not in workspace")
    return _ok(_dump(agent))


@router.delete("/{workspace_id}/agents/{instance_id}")
async def remove_agent(
    workspace_id: str,
    instance_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_admin(db, workspace_id, user.id)
    ok = await workspace_service.remove_agent(db, workspace_id, instance_id)
    if not ok:
        raise AppException(status_code=404, error_code=40452, message_key="errors.workspace.agent_not_found", message="agent not in workspace")
    return _ok(message="removed")


# ── Members ──────────────────────────────────────────

@router.post("/{workspace_id}/members")
async def add_member(
    workspace_id: str,
    data: WorkspaceMemberAdd,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_admin(db, workspace_id, user.id)
    m = await workspace_service.add_member(db, workspace_id, data)
    return _ok(_dump(m))


@router.get("/{workspace_id}/members")
async def list_members(
    workspace_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    members = await workspace_service.list_members(db, workspace_id)
    return _ok([_dump(m) for m in members])


@router.put("/{workspace_id}/members/{user_id}")
async def update_member(
    workspace_id: str,
    user_id: str,
    data: WorkspaceMemberUpdate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_admin(db, workspace_id, user.id)
    m = await workspace_service.update_member(db, workspace_id, user_id, data)
    if m is None:
        raise AppException(status_code=404, error_code=40453, message_key="errors.workspace.member_not_found", message="member not found")
    return _ok(_dump(m))


@router.delete("/{workspace_id}/members/{user_id}")
async def remove_member(
    workspace_id: str,
    user_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_admin(db, workspace_id, user.id)
    ok = await workspace_service.remove_member(db, workspace_id, user_id)
    if not ok:
        raise AppException(status_code=404, error_code=40453, message_key="errors.workspace.member_not_found", message="member not found")
    return _ok(message="removed")


# ── Blackboard ───────────────────────────────────────

@router.get("/{workspace_id}/blackboard")
async def get_blackboard(
    workspace_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    bb = await workspace_service.get_blackboard(db, workspace_id)
    if bb is None:
        raise AppException(status_code=404, error_code=40460, message_key="errors.blackboard.not_found", message="blackboard not found")
    return _ok(_dump(bb))


@router.put("/{workspace_id}/blackboard")
async def update_blackboard(
    workspace_id: str,
    data: BlackboardUpdate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    bb = await workspace_service.update_blackboard(db, workspace_id, data)
    if bb is None:
        raise AppException(status_code=404, error_code=40460, message_key="errors.blackboard.not_found", message="blackboard not found")
    return _ok(_dump(bb))


# ── Posts ─────────────────────────────────────────────

@router.post("/{workspace_id}/posts")
async def create_post(
    workspace_id: str,
    data: PostCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    post = await workspace_service.create_post(db, workspace_id, user.id, data)
    return _ok(_dump(post))


@router.get("/{workspace_id}/posts")
async def list_posts(
    workspace_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    posts = await workspace_service.list_posts(db, workspace_id)
    return _ok([_dump(p) for p in posts])


@router.get("/{workspace_id}/posts/{post_id}")
async def get_post(
    workspace_id: str,
    post_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    post = await workspace_service.get_post(db, post_id)
    if post is None:
        raise AppException(status_code=404, error_code=40461, message_key="errors.post.not_found", message="post not found")
    return _ok(_dump(post))


@router.post("/{workspace_id}/posts/{post_id}/replies")
async def create_reply(
    workspace_id: str,
    post_id: str,
    data: ReplyCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    reply = await workspace_service.create_reply(db, post_id, user.id, data)
    return _ok(_dump(reply))


# ── Objectives ────────────────────────────────────────

@router.post("/{workspace_id}/objectives")
async def create_objective(
    workspace_id: str,
    data: ObjectiveCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    obj = await workspace_service.create_objective(db, workspace_id, user.id, data)
    return _ok(_dump(obj))


@router.get("/{workspace_id}/objectives")
async def list_objectives(
    workspace_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    objs = await workspace_service.list_objectives(db, workspace_id)
    return _ok([_dump(o) for o in objs])


@router.put("/{workspace_id}/objectives/{objective_id}")
async def update_objective(
    workspace_id: str,
    objective_id: str,
    data: ObjectiveUpdate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    obj = await workspace_service.update_objective(db, objective_id, data)
    if obj is None:
        raise AppException(status_code=404, error_code=40462, message_key="errors.objective.not_found", message="objective not found")
    return _ok(_dump(obj))


@router.delete("/{workspace_id}/objectives/{objective_id}")
async def delete_objective(
    workspace_id: str,
    objective_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    ok = await workspace_service.delete_objective(db, objective_id)
    if not ok:
        raise AppException(status_code=404, error_code=40462, message_key="errors.objective.not_found", message="objective not found")
    return _ok(message="deleted")


# ── Messages ──────────────────────────────────────────

@router.get("/{workspace_id}/messages")
async def list_messages(
    workspace_id: str,
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    messages = await workspace_service.list_messages(db, workspace_id, limit)
    return _ok([_dump(m) for m in messages])


@router.post("/{workspace_id}/chat")
async def workspace_chat(
    workspace_id: str,
    data: WorkspaceChatRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    msg = await workspace_service.create_message(
        db, workspace_id, sender_type="human", sender_id=user.id,
        sender_name=user.name, content=data.message,
    )
    return _ok(_dump(msg))


# ── Topology ──────────────────────────────────────────

@router.get("/{workspace_id}/topology")
async def get_topology(
    workspace_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.check_workspace_member(db, workspace_id, user.id)
    topo = await workspace_service.get_topology(db, workspace_id)
    return _ok(_dump(topo))
