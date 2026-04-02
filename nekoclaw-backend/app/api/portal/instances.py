from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_org, get_db
from app.models.user import User
from app.schemas.common import ApiResponse, PaginatedResponse, Pagination
from app.schemas.instance import (
    InstanceCreate,
    InstanceDetail,
    InstanceInfo,
    InstanceMemberCreate,
    InstanceMemberInfo,
    InstanceMemberUpdate,
    InstanceUpdate,
    ScaleRequest,
)
from app.services import instance_service

router = APIRouter(prefix="/instances", tags=["instances"])


@router.get("/check-slug", response_model=ApiResponse[dict])
async def check_slug(
    slug: str = Query(...),
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx
    available = await instance_service.check_slug_available(slug, org.id, db)
    return ApiResponse(data={"available": available})


@router.post("", response_model=ApiResponse[InstanceInfo])
async def create_instance(
    body: InstanceCreate,
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx
    instance = await instance_service.create_instance(body, user, org.id, db)
    return ApiResponse(data=InstanceInfo.model_validate(instance))


@router.get("", response_model=PaginatedResponse[InstanceInfo])
async def list_instances(
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
    cluster_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    user, org = ctx
    instances, total = await instance_service.list_instances(
        org.id, db,
        cluster_id=cluster_id, status_filter=status, search=search,
        page=page, page_size=page_size,
    )
    return PaginatedResponse(
        data=[InstanceInfo.model_validate(i) for i in instances],
        pagination=Pagination(page=page, page_size=page_size, total=total),
    )


@router.get("/{instance_id}", response_model=ApiResponse[InstanceDetail])
async def get_instance(
    instance_id: str,
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx
    instance = await instance_service.get_instance(instance_id, org.id, db)
    return ApiResponse(data=InstanceDetail.model_validate(instance))


@router.put("/{instance_id}", response_model=ApiResponse[InstanceInfo])
async def update_instance(
    instance_id: str,
    body: InstanceUpdate,
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx
    instance = await instance_service.update_instance(instance_id, body, org.id, db)
    return ApiResponse(data=InstanceInfo.model_validate(instance))


@router.delete("/{instance_id}", response_model=ApiResponse)
async def delete_instance(
    instance_id: str,
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx
    await instance_service.delete_instance(instance_id, org.id, user, db)
    return ApiResponse(message="实例已删除")


@router.get("/{instance_id}/members", response_model=ApiResponse[list[InstanceMemberInfo]])
async def list_members(
    instance_id: str,
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx
    members = await instance_service.list_instance_members(instance_id, org.id, db)
    result = []
    for m in members:
        info = InstanceMemberInfo(
            id=m.id,
            instance_id=m.instance_id,
            user_id=m.user_id,
            role=m.role,
            user_name=m.member_user.name if m.member_user else None,
            user_email=m.member_user.email if m.member_user else None,
        )
        result.append(info)
    return ApiResponse(data=result)


@router.post("/{instance_id}/members", response_model=ApiResponse[InstanceMemberInfo])
async def add_member(
    instance_id: str,
    body: InstanceMemberCreate,
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx
    member = await instance_service.add_instance_member(
        instance_id, body.user_id, body.role, org.id, db,
    )
    return ApiResponse(data=InstanceMemberInfo(
        id=member.id,
        instance_id=member.instance_id,
        user_id=member.user_id,
        role=member.role,
    ))


@router.put("/{instance_id}/members/{member_id}", response_model=ApiResponse[InstanceMemberInfo])
async def update_member(
    instance_id: str,
    member_id: str,
    body: InstanceMemberUpdate,
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx
    member = await instance_service.update_instance_member(
        instance_id, member_id, body.role, org.id, db,
    )
    return ApiResponse(data=InstanceMemberInfo(
        id=member.id,
        instance_id=member.instance_id,
        user_id=member.user_id,
        role=member.role,
    ))


@router.delete("/{instance_id}/members/{member_id}", response_model=ApiResponse)
async def remove_member(
    instance_id: str,
    member_id: str,
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx
    await instance_service.remove_instance_member(instance_id, member_id, org.id, db)
    return ApiResponse(message="成员已移除")
