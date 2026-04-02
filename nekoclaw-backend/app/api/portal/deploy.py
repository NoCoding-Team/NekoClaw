import asyncio

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_org, get_db
from app.models.cluster import Cluster
from app.models.deploy_record import DeployRecord
from app.models.instance import Instance
from app.schemas.common import ApiResponse
from app.services import deploy_service, instance_service
from app.services.k8s.event_bus import event_bus

router = APIRouter(tags=["deploy"])


class AdoptRequest(BaseModel):
    instance_id: str


class PrecheckRequest(BaseModel):
    cluster_id: str
    slug: str


@router.post("/precheck", response_model=ApiResponse[dict])
async def precheck(
    body: PrecheckRequest,
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx

    cluster = (await db.execute(
        select(Cluster).where(
            Cluster.id == body.cluster_id,
            Cluster.org_id == org.id,
            Cluster.deleted_at.is_(None),
        )
    )).scalar_one_or_none()
    if cluster is None:
        raise HTTPException(status_code=404, detail={
            "error_code": 40420,
            "message_key": "errors.cluster.not_found",
            "message": "集群不存在",
        })

    slug_ok = await instance_service.check_slug_available(body.slug, org.id, db)
    return ApiResponse(data={
        "cluster_available": True,
        "slug_available": slug_ok,
        "cluster_status": cluster.status,
    })


@router.post("/adopt", response_model=ApiResponse[dict])
async def adopt(
    body: AdoptRequest,
    ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = ctx
    instance = await instance_service.get_instance(body.instance_id, org.id, db)

    deploy_id = await deploy_service.deploy_instance(instance, user.id, db)
    return ApiResponse(data={"deploy_id": deploy_id, "instance_id": instance.id})


@router.get("/adopt/progress/{deploy_id}")
async def adopt_progress(deploy_id: str):
    async def generate():
        timeout = 360
        elapsed = 0
        async for event in event_bus.subscribe("deploy_progress"):
            if event.data.get("deploy_id") == deploy_id:
                yield event.format()
                if event.data.get("status") in ("success", "failed"):
                    break
            elapsed += 0
            if elapsed > timeout:
                break

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
