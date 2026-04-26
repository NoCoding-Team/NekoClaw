from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import get_db, get_current_user
from ..models.scheduled_task import ScheduledTask
from ..models.scheduled_task_run import ScheduledTaskRun
from ..models.user import User
from ..schemas.scheduled_task import (
    InferToolsRequest,
    InferToolsResponse,
    ScheduledTaskCreate,
    ScheduledTaskOut,
    ScheduledTaskRunCreate,
    ScheduledTaskRunOut,
    ScheduledTaskRunUpdate,
    ScheduledTaskUpdate,
)

router = APIRouter(prefix="/scheduled-tasks", tags=["scheduled-tasks"])


@router.post("/infer-tools", response_model=InferToolsResponse)
async def infer_tools(
    body: InferToolsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Infer the required allowed_tools and skill_id for a task description using LLM."""
    from ..services.task_tool_inference import infer_tools_for_task

    try:
        result = await infer_tools_for_task(body.description, current_user.id, db)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return InferToolsResponse(**result)


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
    _validate_schedule(body.schedule_type, body.cron_expr, body.run_at)
    task = ScheduledTask(
        user_id=current_user.id,
        **body.model_dump(),
    )
    _sync_task_state(task)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.put("/{task_id}", response_model=ScheduledTaskOut)
async def update_task(
    task_id: str,
    body: ScheduledTaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task(task_id, current_user.id, db)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
    _validate_schedule(task.schedule_type, task.cron_expr, task.run_at)
    _sync_task_state(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task(task_id, current_user.id, db)
    task.deleted_at = datetime.now(timezone.utc)
    task.status = "deleted"
    await db.commit()


@router.get("/{task_id}/runs", response_model=List[ScheduledTaskRunOut])
async def list_task_runs(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_task(task_id, current_user.id, db)
    result = await db.execute(
        select(ScheduledTaskRun)
        .where(
            ScheduledTaskRun.task_id == task_id,
            ScheduledTaskRun.user_id == current_user.id,
            ScheduledTaskRun.deleted_at.is_(None),
        )
        .order_by(ScheduledTaskRun.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{task_id}/runs", response_model=ScheduledTaskRunOut, status_code=status.HTTP_201_CREATED)
async def create_task_run(
    task_id: str,
    body: ScheduledTaskRunCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task(task_id, current_user.id, db)
    run = _build_run(task, body.status, body.trigger_type, body.scheduled_for)
    _apply_run_status(task, run)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


@router.patch("/{task_id}/runs/{run_id}", response_model=ScheduledTaskRunOut)
async def update_task_run(
    task_id: str,
    run_id: str,
    body: ScheduledTaskRunUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task(task_id, current_user.id, db)
    result = await db.execute(
        select(ScheduledTaskRun).where(
            ScheduledTaskRun.id == run_id,
            ScheduledTaskRun.task_id == task_id,
            ScheduledTaskRun.user_id == current_user.id,
            ScheduledTaskRun.deleted_at.is_(None),
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="执行记录不存在")

    run.status = body.status
    run.session_id = body.session_id
    run.error_message = body.error_message
    run.summary = body.summary
    _apply_run_status(task, run)
    await db.commit()
    await db.refresh(run)
    return run


@router.post("/{task_id}/trigger", response_model=ScheduledTaskRunOut)
async def trigger_task_now(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """立即触发一次定时任务，返回待执行的 run 记录。"""
    task = await _get_task(task_id, current_user.id, db)
    now = datetime.now(timezone.utc)
    run = _build_run(task, "running", "manual", now)
    _apply_run_status(task, run)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


async def _get_task(task_id: str, user_id: str, db: AsyncSession) -> ScheduledTask:
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


def _validate_schedule(schedule_type: str, cron_expr: str | None, run_at: datetime | None) -> None:
    if schedule_type == "once" and not run_at:
        raise HTTPException(status_code=422, detail="一次性任务必须提供 run_at")
    if schedule_type == "cron" and not cron_expr:
        raise HTTPException(status_code=422, detail="周期任务必须提供 cron_expr")
    if cron_expr and not _is_valid_cron(cron_expr):
        raise HTTPException(status_code=422, detail="Cron 表达式格式无效")


def _sync_task_state(task: ScheduledTask) -> None:
    task.status = "enabled" if task.is_enabled else "paused"
    task.next_run_at = _calculate_next_run_at(task)


def _build_run(
    task: ScheduledTask,
    run_status: str,
    trigger_type: str,
    scheduled_for: datetime | None,
) -> ScheduledTaskRun:
    now = datetime.now(timezone.utc)
    finished_at = now if run_status in {"missed", "ignored", "failed", "success", "cancelled"} else None
    return ScheduledTaskRun(
        task_id=task.id,
        user_id=task.user_id,
        scheduled_for=scheduled_for or task.next_run_at or now,
        started_at=None if run_status == "missed" else now,
        finished_at=finished_at,
        status=run_status,
        trigger_type=trigger_type,
        allowed_tools_snapshot=list(task.allowed_tools or []),
    )


def _apply_run_status(task: ScheduledTask, run: ScheduledTaskRun) -> None:
    now = datetime.now(timezone.utc)
    run.status = run.status or "running"
    if run.status in {"success", "failed", "missed", "ignored", "cancelled"}:
        run.finished_at = run.finished_at or now
    if run.started_at and run.finished_at:
        run.duration_ms = int((run.finished_at - run.started_at).total_seconds() * 1000)

    task.last_status = run.status
    if run.status == "running":
        return
    if run.status == "success":
        task.last_run_at = run.finished_at or now
        task.run_count += 1
    elif run.status == "missed":
        task.missed_count += 1

    if task.schedule_type == "once" and run.status in {"success", "ignored", "cancelled"}:
        task.is_enabled = False
        task.status = "completed"
        task.next_run_at = None
    else:
        _sync_task_state(task)


def _calculate_next_run_at(task: ScheduledTask) -> datetime | None:
    if not task.is_enabled or task.status in {"paused", "deleted", "completed"}:
        return None
    now = datetime.now(timezone.utc)
    if task.schedule_type == "once":
        if task.run_at and _to_utc(task.run_at) > now:
            return _to_utc(task.run_at)
        return None
    if task.schedule_type == "cron" and task.cron_expr:
        return _next_cron_time(task.cron_expr, now)
    return None


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _is_valid_cron(expr: str) -> bool:
    parts = expr.split()
    if len(parts) == 6:
        parts = parts[1:]
    if len(parts) != 5:
        return False
    ranges = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]
    return all(_cron_field_values(part, low, high) is not None for part, (low, high) in zip(parts, ranges))


def _next_cron_time(expr: str, after: datetime) -> datetime | None:
    parts = expr.split()
    if len(parts) == 6:
        parts = parts[1:]
    if len(parts) != 5:
        return None
    ranges = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]
    values = [_cron_field_values(part, low, high) for part, (low, high) in zip(parts, ranges)]
    if any(value is None for value in values):
        return None

    minute_values, hour_values, day_values, month_values, weekday_values = values
    candidate = after.astimezone(timezone.utc).replace(second=0, microsecond=0) + timedelta(minutes=1)
    limit = candidate + timedelta(days=366)
    while candidate <= limit:
        weekday = (candidate.weekday() + 1) % 7
        if (
            candidate.minute in minute_values
            and candidate.hour in hour_values
            and candidate.day in day_values
            and candidate.month in month_values
            and (weekday in weekday_values or (weekday == 0 and 7 in weekday_values))
        ):
            return candidate
        candidate += timedelta(minutes=1)
    return None


def _cron_field_values(field: str, low: int, high: int) -> set[int] | None:
    values: set[int] = set()
    for raw_part in field.split(","):
        if not raw_part:
            return None
        step = 1
        part = raw_part
        if "/" in part:
            part, raw_step = part.split("/", 1)
            if not raw_step.isdigit() or int(raw_step) <= 0:
                return None
            step = int(raw_step)
        if part == "*":
            start, end = low, high
        elif "-" in part:
            raw_start, raw_end = part.split("-", 1)
            if not raw_start.isdigit() or not raw_end.isdigit():
                return None
            start, end = int(raw_start), int(raw_end)
        elif part.isdigit():
            start = end = int(part)
        else:
            return None
        if start < low or end > high or start > end:
            return None
        values.update(range(start, end + 1, step))
    return values
