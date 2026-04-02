import logging
import re
import secrets

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.hooks import emit
from app.models.base import not_deleted
from app.models.deploy_record import DeployRecord, DeployStatus
from app.models.instance import Instance, InstanceStatus
from app.models.instance_member import InstanceMember, InstanceRole
from app.models.user import User
from app.schemas.instance import InstanceCreate, InstanceUpdate

logger = logging.getLogger(__name__)

_RESOURCE_RE = re.compile(r"^(\d+(?:\.\d+)?)(m|Mi|Gi|Ki|Ti)?$")

VALID_TRANSITIONS: dict[str, set[str]] = {
    "creating": {"pending", "deploying", "failed", "deleting"},
    "pending": {"deploying", "failed", "deleting"},
    "deploying": {"running", "failed", "deleting"},
    "running": {"learning", "restarting", "updating", "failed", "deleting"},
    "learning": {"running", "failed", "deleting"},
    "restarting": {"running", "failed", "deleting"},
    "updating": {"running", "failed", "deleting"},
    "failed": {"deploying", "restarting", "deleting"},
    "deleting": set(),
}


def validate_state_transition(current: str, target: str) -> bool:
    return target in VALID_TRANSITIONS.get(current, set())


def _parse_resource(value: str) -> tuple[float, str]:
    m = _RESOURCE_RE.match(value)
    if not m:
        raise ValueError(f"Invalid resource value: {value}")
    return float(m.group(1)), m.group(2) or ""


def _to_base_unit(value: str, resource_type: str) -> float:
    num, unit = _parse_resource(value)
    if resource_type == "cpu":
        if unit == "m":
            return num
        return num * 1000
    if unit == "Ki":
        return num * 1024
    if unit == "Mi":
        return num * 1024 * 1024
    if unit == "Gi":
        return num * 1024 * 1024 * 1024
    if unit == "Ti":
        return num * 1024 * 1024 * 1024 * 1024
    return num


def validate_resource_config(
    cpu_request: str, cpu_limit: str,
    mem_request: str, mem_limit: str,
) -> None:
    cpu_req = _to_base_unit(cpu_request, "cpu")
    cpu_lim = _to_base_unit(cpu_limit, "cpu")
    if cpu_lim < cpu_req:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": 40060,
                "message_key": "errors.instance.cpu_limit_less_than_request",
                "message": "CPU limit 不能小于 request",
            },
        )

    mem_req = _to_base_unit(mem_request, "mem")
    mem_lim = _to_base_unit(mem_limit, "mem")
    if mem_lim < mem_req:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": 40061,
                "message_key": "errors.instance.mem_limit_less_than_request",
                "message": "内存 limit 不能小于 request",
            },
        )


async def check_slug_available(slug: str, org_id: str | None, db: AsyncSession) -> bool:
    result = await db.execute(
        select(Instance).where(
            Instance.slug == slug,
            Instance.org_id == org_id,
            Instance.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none() is None


async def create_instance(
    data: InstanceCreate, user: User, org_id: str | None, db: AsyncSession,
) -> Instance:
    if not await check_slug_available(data.slug, org_id, db):
        raise HTTPException(
            status_code=409,
            detail={
                "error_code": 40901,
                "message_key": "errors.instance.slug_conflict",
                "message": f"slug '{data.slug}' 已被使用",
            },
        )

    validate_resource_config(data.cpu_request, data.cpu_limit, data.mem_request, data.mem_limit)

    instance = Instance(
        name=data.name,
        slug=data.slug,
        cluster_id=data.cluster_id,
        namespace=f"nc-{data.slug}",
        image_version=data.image_version,
        replicas=data.replicas,
        cpu_request=data.cpu_request,
        cpu_limit=data.cpu_limit,
        mem_request=data.mem_request,
        mem_limit=data.mem_limit,
        storage_size=data.storage_size,
        compute_provider=data.compute_provider,
        cat_breed=data.cat_breed,
        cat_fur_color=data.cat_fur_color,
        cat_personality=data.cat_personality,
        cat_theme_color=data.cat_theme_color,
        proxy_token=f"nekoclaw-gw-{secrets.token_hex(16)}",
        wp_api_key=f"nekoclaw-wp-{secrets.token_hex(16)}",
        created_by=user.id,
        org_id=org_id,
        status=InstanceStatus.creating,
    )
    db.add(instance)
    await db.flush()

    db.add(InstanceMember(
        instance_id=instance.id,
        user_id=user.id,
        role=InstanceRole.admin,
    ))

    await db.commit()
    await db.refresh(instance)

    await emit("instance.created", instance=instance, user=user)
    logger.info("Instance created: %s (slug=%s)", instance.id, instance.slug)
    return instance


async def list_instances(
    org_id: str | None, db: AsyncSession,
    *,
    cluster_id: str | None = None,
    status_filter: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Instance], int]:
    query = select(Instance).where(
        Instance.org_id == org_id,
        Instance.deleted_at.is_(None),
    )
    count_query = select(func.count(Instance.id)).where(
        Instance.org_id == org_id,
        Instance.deleted_at.is_(None),
    )

    if cluster_id:
        query = query.where(Instance.cluster_id == cluster_id)
        count_query = count_query.where(Instance.cluster_id == cluster_id)
    if status_filter:
        query = query.where(Instance.status == status_filter)
        count_query = count_query.where(Instance.status == status_filter)
    if search:
        like = f"%{search}%"
        query = query.where(Instance.name.ilike(like) | Instance.slug.ilike(like))
        count_query = count_query.where(Instance.name.ilike(like) | Instance.slug.ilike(like))

    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(Instance.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def get_instance(instance_id: str, org_id: str | None, db: AsyncSession) -> Instance:
    result = await db.execute(
        select(Instance)
        .options(selectinload(Instance.members))
        .where(
            Instance.id == instance_id,
            Instance.org_id == org_id,
            Instance.deleted_at.is_(None),
        )
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error_code": 40410,
                "message_key": "errors.instance.not_found",
                "message": "实例不存在",
            },
        )
    return instance


async def update_instance(
    instance_id: str, data: InstanceUpdate, org_id: str | None, db: AsyncSession,
) -> Instance:
    instance = await get_instance(instance_id, org_id, db)

    update_fields = data.model_dump(exclude_unset=True)
    if "cpu_request" in update_fields or "cpu_limit" in update_fields or \
       "mem_request" in update_fields or "mem_limit" in update_fields:
        validate_resource_config(
            update_fields.get("cpu_request", instance.cpu_request),
            update_fields.get("cpu_limit", instance.cpu_limit),
            update_fields.get("mem_request", instance.mem_request),
            update_fields.get("mem_limit", instance.mem_limit),
        )

    for key, value in update_fields.items():
        setattr(instance, key, value)

    await db.commit()
    await db.refresh(instance)
    await emit("instance.updated", instance=instance)
    return instance


async def delete_instance(
    instance_id: str, org_id: str | None, user: User, db: AsyncSession,
) -> None:
    instance = await get_instance(instance_id, org_id, db)

    if instance.status == InstanceStatus.deleting:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": 40062,
                "message_key": "errors.instance.already_deleting",
                "message": "实例正在删除中",
            },
        )

    instance.status = InstanceStatus.deleting
    instance.deleted_at = func.now()
    await db.commit()

    await emit("instance.deleted", instance=instance, user=user)
    logger.info("Instance deleted: %s (slug=%s)", instance.id, instance.slug)


async def transition_status(
    instance: Instance, target_status: str, db: AsyncSession,
    *, message: str | None = None,
) -> Instance:
    if not validate_state_transition(instance.status, target_status):
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": 40063,
                "message_key": "errors.instance.invalid_state_transition",
                "message": f"无法从 {instance.status} 转换到 {target_status}",
            },
        )

    old_status = instance.status
    instance.status = target_status
    await db.commit()
    await db.refresh(instance)

    await emit("instance.status_changed", instance=instance, old_status=old_status, new_status=target_status)
    logger.info("Instance %s: %s -> %s", instance.id, old_status, target_status)
    return instance


async def add_instance_member(
    instance_id: str, user_id: str, role: str,
    org_id: str | None, db: AsyncSession,
) -> InstanceMember:
    instance = await get_instance(instance_id, org_id, db)

    result = await db.execute(
        select(InstanceMember).where(
            InstanceMember.instance_id == instance.id,
            InstanceMember.user_id == user_id,
            InstanceMember.deleted_at.is_(None),
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "error_code": 40902,
                "message_key": "errors.instance.member_already_exists",
                "message": "该用户已是实例成员",
            },
        )

    member = InstanceMember(
        instance_id=instance.id,
        user_id=user_id,
        role=role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


async def update_instance_member(
    instance_id: str, member_id: str, role: str,
    org_id: str | None, db: AsyncSession,
) -> InstanceMember:
    await get_instance(instance_id, org_id, db)

    result = await db.execute(
        select(InstanceMember).where(
            InstanceMember.id == member_id,
            InstanceMember.instance_id == instance_id,
            InstanceMember.deleted_at.is_(None),
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error_code": 40411,
                "message_key": "errors.instance.member_not_found",
                "message": "实例成员不存在",
            },
        )

    member.role = role
    await db.commit()
    await db.refresh(member)
    return member


async def remove_instance_member(
    instance_id: str, member_id: str,
    org_id: str | None, db: AsyncSession,
) -> None:
    await get_instance(instance_id, org_id, db)

    result = await db.execute(
        select(InstanceMember).where(
            InstanceMember.id == member_id,
            InstanceMember.instance_id == instance_id,
            InstanceMember.deleted_at.is_(None),
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error_code": 40411,
                "message_key": "errors.instance.member_not_found",
                "message": "实例成员不存在",
            },
        )

    member.deleted_at = func.now()
    await db.commit()


async def list_instance_members(
    instance_id: str, org_id: str | None, db: AsyncSession,
) -> list[InstanceMember]:
    await get_instance(instance_id, org_id, db)

    result = await db.execute(
        select(InstanceMember)
        .options(selectinload(InstanceMember.member_user))
        .where(
            InstanceMember.instance_id == instance_id,
            InstanceMember.deleted_at.is_(None),
        )
    )
    return list(result.scalars().all())
