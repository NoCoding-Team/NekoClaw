import uuid
import os
import re
from fastapi import APIRouter, Depends, Query, Body
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.core.deps import get_db, get_current_user
from app.core.config import settings
from app.core.exceptions import NotFoundError, ForbiddenError, ConflictError
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
    # 乐观锁：如果客户端传了 version，它必须与当前记录版本一致
    if payload.version is not None and payload.version != mem.version:
        raise ConflictError(f"数据已被其他请求修改（当前版本：{mem.version}），请刷新后重试")
    for field, value in payload.model_dump(exclude_none=True, exclude={"version"}).items():
        setattr(mem, field, value)
    mem.version += 1
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


# ── Memory Files API (Markdown file-based) ─────────────────────────────────

def _user_memory_dir(user_id: str) -> str:
    """Get the per-user memory file directory, creating it if needed."""
    d = os.path.join(settings.MEMORY_FILES_DIR, user_id)
    os.makedirs(d, exist_ok=True)
    return d


def _validate_memory_filename(name: str) -> str:
    """Validate and sanitize a memory file name."""
    if not name or not name.endswith('.md'):
        raise NotFoundError("Only .md files are allowed")
    # Reject path traversal and absolute paths
    if '..' in name or '/' in name or '\\' in name or os.path.isabs(name):
        raise ForbiddenError("Invalid file name")
    if not re.match(r'^[\w\-. ]+\.md$', name):
        raise ForbiddenError("Invalid file name characters")
    return name


@router.get("/files")
async def list_memory_files(current_user: User = Depends(get_current_user)):
    """List all memory files for the current user."""
    d = _user_memory_dir(current_user.id)
    files = []
    for fname in os.listdir(d):
        if fname.endswith('.md'):
            fpath = os.path.join(d, fname)
            stat = os.stat(fpath)
            files.append({"name": fname, "modifiedAt": stat.st_mtime})
    files.sort(key=lambda f: (f["name"] != "MEMORY.md", -f["modifiedAt"]))
    return files


@router.get("/files/{filename}")
async def read_memory_file(filename: str, current_user: User = Depends(get_current_user)):
    """Read a memory file's content."""
    name = _validate_memory_filename(filename)
    fpath = os.path.join(_user_memory_dir(current_user.id), name)
    if not os.path.isfile(fpath):
        raise NotFoundError("File not found")
    with open(fpath, 'r', encoding='utf-8') as f:
        return {"path": name, "content": f.read()}


@router.put("/files/{filename}")
async def write_memory_file(
    filename: str,
    content: str = Body(..., media_type="text/plain"),
    current_user: User = Depends(get_current_user),
):
    """Write (create or overwrite) a memory file."""
    name = _validate_memory_filename(filename)
    # Sanitize content: strip ASCII control chars except \n \t
    sanitized = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', content)
    fpath = os.path.join(_user_memory_dir(current_user.id), name)
    os.makedirs(os.path.dirname(fpath), exist_ok=True)
    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(sanitized)

    # Rebuild memory RAG index when MEMORY.md is updated
    if name == "MEMORY.md":
        try:
            from app.services.memory_index import rebuild_memory_index
            await rebuild_memory_index(current_user.id)
        except Exception:
            pass  # Non-critical: index rebuild failure should not block write

    return {"ok": True, "path": name}


@router.delete("/files/{filename}")
async def delete_memory_file(filename: str, current_user: User = Depends(get_current_user)):
    """Hard-delete a memory file for the current user."""
    name = _validate_memory_filename(filename)
    fpath = os.path.join(_user_memory_dir(current_user.id), name)
    if not os.path.isfile(fpath):
        raise NotFoundError("File not found")
    os.remove(fpath)
    return {"name": name, "success": True}
