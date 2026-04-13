from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import get_db, get_current_user
from ..models.scheduled_task import ScheduledTask
from ..models.user import User
from ..schemas.scheduled_task import ScheduledTaskCreate, ScheduledTaskUpdate, ScheduledTaskOut

router = APIRouter(prefix="/scheduled-tasks", tags=["scheduled-tasks"])


@router.get("", response_model=List[ScheduledTaskOut])
async def list_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ScheduledTask)
        .where(ScheduledTask.user_id == current_user.id, ScheduledTask.deleted_at.is_(None))
        .order_by(ScheduledTask.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=ScheduledTaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    body: ScheduledTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.cron_expr and not body.run_at:
        raise HTTPException(status_code=422, detail="cron_expr 和 run_at 至少提供一个")
    task = ScheduledTask(
        user_id=current_user.id,
        **body.model_dump(),
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.put("/{task_id}", response_model=ScheduledTaskOut)
async def update_task(
    task_id: int,
    body: ScheduledTaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task(task_id, current_user.id, db)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(task, k, v)
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task(task_id, current_user.id, db)
    task.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.post("/{task_id}/trigger", response_model=ScheduledTaskOut)
async def trigger_task_now(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """立即触发一次定时任务（手动执行）"""
    task = await _get_task(task_id, current_user.id, db)
    now = datetime.now(timezone.utc)
    task.last_run_at = now
    task.run_count += 1
    await db.commit()
    await db.refresh(task)
    return task


async def _get_task(task_id: int, user_id: int, db: AsyncSession) -> ScheduledTask:
    result = await db.execute(
        select(ScheduledTask).where(
            ScheduledTask.id == task_id,
            ScheduledTask.user_id == user_id,
            ScheduledTask.deleted_at.is_(None),
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task
