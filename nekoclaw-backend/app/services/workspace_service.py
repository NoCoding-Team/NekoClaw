import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.models.base import not_deleted
from app.models.blackboard import Blackboard, BlackboardPost, BlackboardReply
from app.models.instance import Instance
from app.models.user import User
from app.models.workspace import Workspace
from app.models.workspace_agent import WorkspaceAgent
from app.models.workspace_member import WorkspaceMember, WorkspaceRole
from app.models.workspace_message import WorkspaceMessage
from app.models.workspace_objective import WorkspaceObjective
from app.schemas.workspace import (
    AddAgentRequest,
    AgentBrief,
    BlackboardInfo,
    BlackboardUpdate,
    ObjectiveCreate,
    ObjectiveInfo,
    ObjectiveUpdate,
    PostCreate,
    PostInfo,
    PostListItem,
    PostUpdate,
    ReplyCreate,
    ReplyInfo,
    TopologyInfo,
    TopologyNode,
    UpdateAgentRequest,
    WorkspaceAgentInfo,
    WorkspaceCreate,
    WorkspaceInfo,
    WorkspaceListItem,
    WorkspaceMemberAdd,
    WorkspaceMemberInfo,
    WorkspaceMemberUpdate,
    WorkspaceMessageInfo,
    WorkspaceUpdate,
)

logger = logging.getLogger(__name__)


def _agent_brief(inst: Instance, wa: WorkspaceAgent) -> AgentBrief:
    return AgentBrief(
        instance_id=inst.id,
        name=inst.name,
        slug=inst.slug,
        status=inst.status,
        hex_q=wa.hex_q,
        hex_r=wa.hex_r,
        cat_state=inst.cat_state,
        theme_color=inst.cat_theme_color,
    )


async def _workspace_info(db: AsyncSession, ws: Workspace) -> WorkspaceInfo:
    stmt = (
        select(WorkspaceAgent, Instance)
        .join(Instance, WorkspaceAgent.instance_id == Instance.id)
        .where(WorkspaceAgent.workspace_id == ws.id, not_deleted(WorkspaceAgent), not_deleted(Instance))
    )
    rows = (await db.execute(stmt)).all()
    agents = [_agent_brief(inst, wa) for wa, inst in rows]
    return WorkspaceInfo(
        id=ws.id, org_id=ws.org_id, name=ws.name, description=ws.description,
        color=ws.color, icon=ws.icon, created_by=ws.created_by,
        agent_count=len(agents), agents=agents,
        created_at=ws.created_at, updated_at=ws.updated_at,
    )


async def create_workspace(db: AsyncSession, org_id: str, user_id: str, data: WorkspaceCreate) -> WorkspaceInfo:
    ws = Workspace(
        org_id=org_id,
        name=data.name,
        description=data.description,
        color=data.color,
        icon=data.icon,
        created_by=user_id,
    )
    db.add(ws)
    await db.flush()

    bb = Blackboard(workspace_id=ws.id)
    db.add(bb)

    member = WorkspaceMember(workspace_id=ws.id, user_id=user_id, role=WorkspaceRole.owner, is_admin=True)
    db.add(member)

    await db.commit()
    await db.refresh(ws)
    return await _workspace_info(db, ws)


async def list_workspaces(db: AsyncSession, org_id: str, user_id: str) -> list[WorkspaceListItem]:
    member_ws_ids = select(WorkspaceMember.workspace_id).where(
        WorkspaceMember.user_id == user_id,
        not_deleted(WorkspaceMember),
    ).scalar_subquery()

    stmt = (
        select(Workspace)
        .where(Workspace.org_id == org_id, Workspace.id.in_(member_ws_ids), not_deleted(Workspace))
        .order_by(Workspace.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()

    items: list[WorkspaceListItem] = []
    for ws in rows:
        agent_stmt = (
            select(WorkspaceAgent, Instance)
            .join(Instance, WorkspaceAgent.instance_id == Instance.id)
            .where(WorkspaceAgent.workspace_id == ws.id, not_deleted(WorkspaceAgent), not_deleted(Instance))
        )
        agent_rows = (await db.execute(agent_stmt)).all()
        agents = [_agent_brief(inst, wa) for wa, inst in agent_rows]
        items.append(WorkspaceListItem(
            id=ws.id, name=ws.name, description=ws.description,
            color=ws.color, icon=ws.icon, agent_count=len(agents), agents=agents,
            created_at=ws.created_at,
        ))
    return items


async def get_workspace(db: AsyncSession, workspace_id: str) -> WorkspaceInfo | None:
    stmt = select(Workspace).where(Workspace.id == workspace_id, not_deleted(Workspace))
    ws = (await db.execute(stmt)).scalar_one_or_none()
    if ws is None:
        return None
    return await _workspace_info(db, ws)


async def update_workspace(db: AsyncSession, workspace_id: str, data: WorkspaceUpdate) -> WorkspaceInfo | None:
    stmt = select(Workspace).where(Workspace.id == workspace_id, not_deleted(Workspace))
    ws = (await db.execute(stmt)).scalar_one_or_none()
    if ws is None:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ws, field, value)
    await db.commit()
    await db.refresh(ws)
    return await _workspace_info(db, ws)


async def delete_workspace(db: AsyncSession, workspace_id: str) -> bool:
    stmt = select(Workspace).where(Workspace.id == workspace_id, not_deleted(Workspace))
    ws = (await db.execute(stmt)).scalar_one_or_none()
    if ws is None:
        return False
    ws.deleted_at = func.now()
    await db.commit()
    return True


# ── Agent Management ─────────────────────────────────

async def add_agent(
    db: AsyncSession, workspace_id: str, data: AddAgentRequest, user_id: str,
) -> WorkspaceAgentInfo:
    inst = (await db.execute(
        select(Instance).where(Instance.id == data.instance_id, not_deleted(Instance))
    )).scalar_one_or_none()
    if inst is None:
        raise AppException(status_code=404, error_code=40450, message_key="errors.instance.not_found", message="instance not found")

    existing = (await db.execute(
        select(WorkspaceAgent).where(
            WorkspaceAgent.workspace_id == workspace_id,
            WorkspaceAgent.instance_id == data.instance_id,
            not_deleted(WorkspaceAgent),
        )
    )).scalar_one_or_none()
    if existing:
        raise AppException(status_code=409, error_code=40960, message_key="errors.workspace.agent_exists", message="agent already in workspace")

    wa = WorkspaceAgent(
        workspace_id=workspace_id,
        instance_id=data.instance_id,
        hex_q=data.hex_q,
        hex_r=data.hex_r,
    )
    db.add(wa)
    await db.commit()
    await db.refresh(wa)
    return WorkspaceAgentInfo(
        id=wa.id, workspace_id=wa.workspace_id, instance_id=wa.instance_id,
        instance_name=inst.name, hex_q=wa.hex_q, hex_r=wa.hex_r,
        channel_type=wa.channel_type, cat_state=inst.cat_state, created_at=wa.created_at,
    )


async def update_agent(
    db: AsyncSession, workspace_id: str, instance_id: str, data: UpdateAgentRequest,
) -> WorkspaceAgentInfo | None:
    wa = (await db.execute(
        select(WorkspaceAgent).where(
            WorkspaceAgent.workspace_id == workspace_id,
            WorkspaceAgent.instance_id == instance_id,
            not_deleted(WorkspaceAgent),
        )
    )).scalar_one_or_none()
    if wa is None:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(wa, field, value)
    await db.commit()
    await db.refresh(wa)
    inst = (await db.execute(select(Instance).where(Instance.id == instance_id))).scalar_one_or_none()
    return WorkspaceAgentInfo(
        id=wa.id, workspace_id=wa.workspace_id, instance_id=wa.instance_id,
        instance_name=inst.name if inst else None,
        hex_q=wa.hex_q, hex_r=wa.hex_r,
        channel_type=wa.channel_type, cat_state=inst.cat_state if inst else None,
        created_at=wa.created_at,
    )


async def remove_agent(db: AsyncSession, workspace_id: str, instance_id: str) -> bool:
    wa = (await db.execute(
        select(WorkspaceAgent).where(
            WorkspaceAgent.workspace_id == workspace_id,
            WorkspaceAgent.instance_id == instance_id,
            not_deleted(WorkspaceAgent),
        )
    )).scalar_one_or_none()
    if wa is None:
        return False
    wa.deleted_at = func.now()
    await db.commit()
    return True


async def list_agents(db: AsyncSession, workspace_id: str) -> list[WorkspaceAgentInfo]:
    stmt = (
        select(WorkspaceAgent, Instance)
        .join(Instance, WorkspaceAgent.instance_id == Instance.id)
        .where(WorkspaceAgent.workspace_id == workspace_id, not_deleted(WorkspaceAgent), not_deleted(Instance))
    )
    rows = (await db.execute(stmt)).all()
    return [
        WorkspaceAgentInfo(
            id=wa.id, workspace_id=wa.workspace_id, instance_id=wa.instance_id,
            instance_name=inst.name, hex_q=wa.hex_q, hex_r=wa.hex_r,
            channel_type=wa.channel_type, cat_state=inst.cat_state,
            created_at=wa.created_at,
        ) for wa, inst in rows
    ]


# ── Workspace Members ────────────────────────────────

async def add_member(db: AsyncSession, workspace_id: str, data: WorkspaceMemberAdd) -> WorkspaceMemberInfo:
    existing = (await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == data.user_id,
            not_deleted(WorkspaceMember),
        )
    )).scalar_one_or_none()
    if existing:
        raise AppException(status_code=409, error_code=40961, message_key="errors.workspace.member_exists", message="member already in workspace")

    user = (await db.execute(select(User).where(User.id == data.user_id))).scalar_one_or_none()
    if user is None:
        raise AppException(status_code=404, error_code=40451, message_key="errors.user.not_found", message="user not found")

    m = WorkspaceMember(
        workspace_id=workspace_id, user_id=data.user_id,
        role=data.role, is_admin=data.is_admin,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return WorkspaceMemberInfo(
        user_id=m.user_id, user_name=user.name, user_email=user.email,
        role=m.role, is_admin=m.is_admin, hex_q=m.hex_q, hex_r=m.hex_r,
        display_color=m.display_color, created_at=m.created_at,
    )


async def update_member(
    db: AsyncSession, workspace_id: str, user_id: str, data: WorkspaceMemberUpdate,
) -> WorkspaceMemberInfo | None:
    m = (await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            not_deleted(WorkspaceMember),
        )
    )).scalar_one_or_none()
    if m is None:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(m, field, value)
    await db.commit()
    await db.refresh(m)
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    return WorkspaceMemberInfo(
        user_id=m.user_id, user_name=user.name if user else "", user_email=user.email if user else None,
        role=m.role, is_admin=m.is_admin, hex_q=m.hex_q, hex_r=m.hex_r,
        display_color=m.display_color, created_at=m.created_at,
    )


async def remove_member(db: AsyncSession, workspace_id: str, user_id: str) -> bool:
    m = (await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            not_deleted(WorkspaceMember),
        )
    )).scalar_one_or_none()
    if m is None:
        return False
    if m.role == WorkspaceRole.owner:
        raise AppException(status_code=400, error_code=40032, message_key="errors.workspace.cannot_remove_owner", message="cannot remove owner")
    m.deleted_at = func.now()
    await db.commit()
    return True


async def list_members(db: AsyncSession, workspace_id: str) -> list[WorkspaceMemberInfo]:
    stmt = (
        select(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == workspace_id, not_deleted(WorkspaceMember))
        .order_by(WorkspaceMember.created_at)
    )
    rows = (await db.execute(stmt)).all()
    return [
        WorkspaceMemberInfo(
            user_id=m.user_id, user_name=u.name, user_email=u.email,
            role=m.role, is_admin=m.is_admin, hex_q=m.hex_q, hex_r=m.hex_r,
            display_color=m.display_color, created_at=m.created_at,
        ) for m, u in rows
    ]


async def check_workspace_member(db: AsyncSession, workspace_id: str, user_id: str) -> WorkspaceMember:
    m = (await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            not_deleted(WorkspaceMember),
        )
    )).scalar_one_or_none()
    if m is None:
        raise AppException(status_code=403, error_code=40310, message_key="errors.workspace.not_member", message="not a workspace member")
    return m


async def check_workspace_admin(db: AsyncSession, workspace_id: str, user_id: str) -> WorkspaceMember:
    m = await check_workspace_member(db, workspace_id, user_id)
    if not m.is_admin and m.role != WorkspaceRole.owner:
        raise AppException(status_code=403, error_code=40311, message_key="errors.workspace.not_admin", message="workspace admin required")
    return m


# ── Blackboard ───────────────────────────────────────

async def get_blackboard(db: AsyncSession, workspace_id: str) -> BlackboardInfo | None:
    stmt = select(Blackboard).where(Blackboard.workspace_id == workspace_id, not_deleted(Blackboard))
    bb = (await db.execute(stmt)).scalar_one_or_none()
    if bb is None:
        return None
    objectives = await list_objectives(db, workspace_id)
    return BlackboardInfo(
        id=bb.id, workspace_id=bb.workspace_id,
        content=bb.content, objectives=objectives,
        updated_at=bb.updated_at,
    )


async def update_blackboard(db: AsyncSession, workspace_id: str, data: BlackboardUpdate) -> BlackboardInfo | None:
    stmt = select(Blackboard).where(Blackboard.workspace_id == workspace_id, not_deleted(Blackboard))
    bb = (await db.execute(stmt)).scalar_one_or_none()
    if bb is None:
        return None
    bb.content = data.content
    await db.commit()
    await db.refresh(bb)
    objectives = await list_objectives(db, workspace_id)
    return BlackboardInfo(
        id=bb.id, workspace_id=bb.workspace_id,
        content=bb.content, objectives=objectives,
        updated_at=bb.updated_at,
    )


# ── Posts ─────────────────────────────────────────────

async def create_post(db: AsyncSession, workspace_id: str, user_id: str, data: PostCreate) -> PostInfo:
    bb = (await db.execute(
        select(Blackboard).where(Blackboard.workspace_id == workspace_id, not_deleted(Blackboard))
    )).scalar_one_or_none()
    if bb is None:
        raise AppException(status_code=404, error_code=40460, message_key="errors.blackboard.not_found", message="blackboard not found")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    post = BlackboardPost(
        blackboard_id=bb.id, title=data.title, content=data.content, author_id=user_id,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return PostInfo(
        id=post.id, blackboard_id=post.blackboard_id, title=post.title,
        content=post.content, author_id=post.author_id,
        author_name=user.name if user else "",
        created_at=post.created_at, updated_at=post.updated_at,
    )


async def list_posts(db: AsyncSession, workspace_id: str) -> list[PostListItem]:
    bb = (await db.execute(
        select(Blackboard).where(Blackboard.workspace_id == workspace_id, not_deleted(Blackboard))
    )).scalar_one_or_none()
    if bb is None:
        return []
    stmt = (
        select(BlackboardPost, User)
        .outerjoin(User, BlackboardPost.author_id == User.id)
        .where(BlackboardPost.blackboard_id == bb.id, not_deleted(BlackboardPost))
        .order_by(BlackboardPost.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    result = []
    for post, author in rows:
        reply_count = (await db.execute(
            select(func.count()).where(
                BlackboardReply.post_id == post.id, not_deleted(BlackboardReply),
            )
        )).scalar() or 0
        result.append(PostListItem(
            id=post.id, blackboard_id=post.blackboard_id, title=post.title,
            author_id=post.author_id, author_name=author.name if author else "",
            reply_count=reply_count, created_at=post.created_at,
        ))
    return result


async def get_post(db: AsyncSession, post_id: str) -> PostInfo | None:
    post = (await db.execute(
        select(BlackboardPost).where(BlackboardPost.id == post_id, not_deleted(BlackboardPost))
    )).scalar_one_or_none()
    if post is None:
        return None
    author = (await db.execute(select(User).where(User.id == post.author_id))).scalar_one_or_none()
    reply_stmt = (
        select(BlackboardReply, User)
        .outerjoin(User, BlackboardReply.author_id == User.id)
        .where(BlackboardReply.post_id == post.id, not_deleted(BlackboardReply))
        .order_by(BlackboardReply.created_at)
    )
    reply_rows = (await db.execute(reply_stmt)).all()
    replies = [
        ReplyInfo(
            id=r.id, post_id=r.post_id, content=r.content,
            author_id=r.author_id, author_name=u.name if u else "",
            created_at=r.created_at,
        ) for r, u in reply_rows
    ]
    return PostInfo(
        id=post.id, blackboard_id=post.blackboard_id, title=post.title,
        content=post.content, author_id=post.author_id,
        author_name=author.name if author else "",
        reply_count=len(replies), replies=replies,
        created_at=post.created_at, updated_at=post.updated_at,
    )


async def create_reply(db: AsyncSession, post_id: str, user_id: str, data: ReplyCreate) -> ReplyInfo:
    post = (await db.execute(
        select(BlackboardPost).where(BlackboardPost.id == post_id, not_deleted(BlackboardPost))
    )).scalar_one_or_none()
    if post is None:
        raise AppException(status_code=404, error_code=40461, message_key="errors.post.not_found", message="post not found")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    reply = BlackboardReply(post_id=post_id, content=data.content, author_id=user_id)
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return ReplyInfo(
        id=reply.id, post_id=reply.post_id, content=reply.content,
        author_id=reply.author_id, author_name=user.name if user else "",
        created_at=reply.created_at,
    )


# ── Objectives ────────────────────────────────────────

async def create_objective(
    db: AsyncSession, workspace_id: str, user_id: str, data: ObjectiveCreate,
) -> ObjectiveInfo:
    obj = WorkspaceObjective(
        workspace_id=workspace_id, title=data.title,
        description=data.description, obj_type=data.obj_type,
        parent_id=data.parent_id, created_by=user_id,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return ObjectiveInfo(
        id=obj.id, workspace_id=obj.workspace_id, title=obj.title,
        description=obj.description, progress=obj.progress,
        obj_type=obj.obj_type, parent_id=obj.parent_id,
        created_by=obj.created_by,
        created_at=obj.created_at, updated_at=obj.updated_at,
    )


async def update_objective(
    db: AsyncSession, objective_id: str, data: ObjectiveUpdate,
) -> ObjectiveInfo | None:
    obj = (await db.execute(
        select(WorkspaceObjective).where(WorkspaceObjective.id == objective_id, not_deleted(WorkspaceObjective))
    )).scalar_one_or_none()
    if obj is None:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return ObjectiveInfo(
        id=obj.id, workspace_id=obj.workspace_id, title=obj.title,
        description=obj.description, progress=obj.progress,
        obj_type=obj.obj_type, parent_id=obj.parent_id,
        created_by=obj.created_by,
        created_at=obj.created_at, updated_at=obj.updated_at,
    )


async def delete_objective(db: AsyncSession, objective_id: str) -> bool:
    obj = (await db.execute(
        select(WorkspaceObjective).where(WorkspaceObjective.id == objective_id, not_deleted(WorkspaceObjective))
    )).scalar_one_or_none()
    if obj is None:
        return False
    obj.deleted_at = func.now()
    await db.commit()
    return True


async def list_objectives(db: AsyncSession, workspace_id: str) -> list[ObjectiveInfo]:
    stmt = (
        select(WorkspaceObjective)
        .where(WorkspaceObjective.workspace_id == workspace_id, not_deleted(WorkspaceObjective))
        .order_by(WorkspaceObjective.created_at)
    )
    rows = (await db.execute(stmt)).scalars().all()

    by_parent: dict[str | None, list[WorkspaceObjective]] = {}
    for obj in rows:
        by_parent.setdefault(obj.parent_id, []).append(obj)

    def _build_tree(parent_id: str | None) -> list[ObjectiveInfo]:
        children = by_parent.get(parent_id, [])
        return [
            ObjectiveInfo(
                id=o.id, workspace_id=o.workspace_id, title=o.title,
                description=o.description, progress=o.progress,
                obj_type=o.obj_type, parent_id=o.parent_id,
                created_by=o.created_by, children=_build_tree(o.id),
                created_at=o.created_at, updated_at=o.updated_at,
            ) for o in children
        ]

    return _build_tree(None)


# ── Messages ──────────────────────────────────────────

async def create_message(
    db: AsyncSession, workspace_id: str, sender_type: str, sender_id: str,
    sender_name: str, content: str, message_type: str = "chat",
    target_instance_id: str | None = None,
) -> WorkspaceMessageInfo:
    msg = WorkspaceMessage(
        workspace_id=workspace_id, sender_type=sender_type,
        sender_id=sender_id, sender_name=sender_name,
        content=content, message_type=message_type,
        target_instance_id=target_instance_id,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return WorkspaceMessageInfo(
        id=msg.id, workspace_id=msg.workspace_id,
        sender_type=msg.sender_type, sender_id=msg.sender_id,
        sender_name=msg.sender_name, content=msg.content,
        message_type=msg.message_type,
        target_instance_id=msg.target_instance_id,
        depth=msg.depth, created_at=msg.created_at,
    )


async def list_messages(db: AsyncSession, workspace_id: str, limit: int = 50) -> list[WorkspaceMessageInfo]:
    stmt = (
        select(WorkspaceMessage)
        .where(WorkspaceMessage.workspace_id == workspace_id, not_deleted(WorkspaceMessage))
        .order_by(WorkspaceMessage.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        WorkspaceMessageInfo(
            id=m.id, workspace_id=m.workspace_id,
            sender_type=m.sender_type, sender_id=m.sender_id,
            sender_name=m.sender_name, content=m.content,
            message_type=m.message_type,
            target_instance_id=m.target_instance_id,
            depth=m.depth, created_at=m.created_at,
        ) for m in reversed(rows)
    ]


# ── Topology ──────────────────────────────────────────

async def get_topology(db: AsyncSession, workspace_id: str) -> TopologyInfo:
    nodes: list[TopologyNode] = []

    agent_stmt = (
        select(WorkspaceAgent, Instance)
        .join(Instance, WorkspaceAgent.instance_id == Instance.id)
        .where(WorkspaceAgent.workspace_id == workspace_id, not_deleted(WorkspaceAgent), not_deleted(Instance))
    )
    for wa, inst in (await db.execute(agent_stmt)).all():
        nodes.append(TopologyNode(
            node_type="cat", node_id=inst.id, name=inst.name,
            hex_q=wa.hex_q or 0, hex_r=wa.hex_r or 0,
            cat_state=inst.cat_state, theme_color=inst.cat_theme_color,
        ))

    member_stmt = (
        select(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == workspace_id, not_deleted(WorkspaceMember))
    )
    for wm, user in (await db.execute(member_stmt)).all():
        nodes.append(TopologyNode(
            node_type="human", node_id=user.id, name=user.name,
            hex_q=wm.hex_q or 0, hex_r=wm.hex_r or 0,
            display_color=wm.display_color,
        ))

    return TopologyInfo(workspace_id=workspace_id, nodes=nodes)
