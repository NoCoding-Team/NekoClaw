import uuid
from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.core.deps import get_db, get_current_user
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.memory import Memory
from app.models.user import User
from app.schemas.memory import MemoryCreate, MemoryUpdate, MemoryResponse

router = APIRouter(prefix="/memory", tags=["memory"])


async def _get_memory_or_404(memory_id: str, db: AsyncSession, user_id: str) -> Memory:
    mem = await db.get(Memory, memory_id)
    if not mem or mem.is_deleted:
        raise NotFoundError("记忆条目不存在")
    if mem.user_id != user_id:
        raise ForbiddenError("无权访问此记忆条目")
    return mem


@router.get("", response_model=list[MemoryResponse])
async def list_memories(
    category: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Memory).where(Memory.user_id == current_user.id, Memory.deleted_at.is_(None))
    if category:
        stmt = stmt.where(Memory.category == category)
    stmt = stmt.order_by(Memory.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=MemoryResponse)
async def create_memory(
    payload: MemoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mem = Memory(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        **payload.model_dump(),
    )
    db.add(mem)
    await db.commit()
    await db.refresh(mem)
    return mem


@router.put("/{memory_id}", response_model=MemoryResponse)
async def update_memory(
    memory_id: str,
    payload: MemoryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mem = await _get_memory_or_404(memory_id, db, current_user.id)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(mem, field, value)
    await db.commit()
    await db.refresh(mem)
    return mem


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mem = await _get_memory_or_404(memory_id, db, current_user.id)
    mem.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Memory deleted"}


@router.get("/export", response_class=PlainTextResponse)
async def export_memories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export all memories as a Markdown document."""
    result = await db.execute(
        select(Memory)
        .where(Memory.user_id == current_user.id, Memory.deleted_at.is_(None))
        .order_by(Memory.category.asc(), Memory.created_at.asc())
    )
    entries = result.scalars().all()

    lines = ["# NekoClaw 记忆导出\n"]
    current_cat = None
    for entry in entries:
        if entry.category != current_cat:
            current_cat = entry.category
            lines.append(f"\n## {current_cat}\n")
        ts = entry.created_at.strftime("%Y-%m-%d %H:%M")
        lines.append(f"- [{ts}] {entry.content}")

    markdown = "\n".join(lines)
    return PlainTextResponse(
        content=markdown,
        headers={"Content-Disposition": "attachment; filename=nekoclaw_memories.md"},
    )
