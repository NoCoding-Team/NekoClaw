import logging
import uuid
import os
import re
from fastapi import APIRouter, Depends, Query, Body
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.core.deps import get_db, get_current_user
from app.core.config import settings
from app.core.exceptions import NotFoundError, ForbiddenError, ConflictError
from app.models.memory import Memory
from app.models.user import User
from app.schemas.memory import MemoryCreate, MemoryUpdate, MemoryResponse

logger = logging.getLogger(__name__)

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


# ── Generate persona files via LLM ────────────────────────────────────────


class GeneratePersonaRequest(BaseModel):
    userName: str = ""
    timezone: str = ""
    notes: str = ""
    catName: str = ""
    bioType: str = ""
    vibe: str = ""
    catEmoji: str = ""
    traits: list[str] = []
    replyStyle: str = ""
    customPrompt: str = ""


_GENERATE_PERSONA_PROMPT = """\
你是一个配置文件生成器。根据用户提供的个性化设置信息，生成三个 Markdown 配置文件的内容。

用户提供的设置信息：
{user_input}

请严格按照以下格式生成三个文件的内容，用 ===SOUL.md===、===IDENTITY.md===、===USER.md=== 作为分隔标记。
每个文件的内容要丰富、具体、可操作，不要只写几个关键词。

===SOUL.md===
# 人格（Persona）
（根据用户选择的性格特质，展开描述 Agent 的人格特点，2-4 句话）

# 语气（Tone）
（根据用户选择的回复风格，详细描述 Agent 应使用的语气和表达方式，2-4 句话）

# 边界（Boundaries）
- 保护用户隐私，不主动收集敏感信息
- 超出能力范围时诚实告知
- 遵循道德规范和法律规定
{custom_instructions_section}
===IDENTITY.md===
# 名称（Name）
- **名称**：{cat_name}
（用 1-2 句话描述这个名字的含义或风格）

# 风格（Vibe）
- **风格**：{vibe}
（用 1-2 句话展开描述这种风格的特点）

# 表情（Emoji）
- **表情**：{emoji}
（用 1 句话描述选择这个表情的含义）

===USER.md===
# 用户画像（User Profile）
（根据用户提供的姓名、时区和备注，描述用户的基本画像信息，2-3 句话）

# 称呼方式（Preferred Addressing）
- **称呼**：{user_name}
（描述如何称呼用户）

# 用户备注
{notes}

注意：
1. 必须严格使用 ===SOUL.md===、===IDENTITY.md===、===USER.md=== 分隔三个文件
2. 生成的内容要基于用户提供的信息进行合理扩展和丰富
3. 如果某项信息用户未提供，使用合理的默认值
4. 使用中文
5. 不要输出任何分隔标记之外的内容
"""


@router.post("/generate-persona")
async def generate_persona(
    req: GeneratePersonaRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Use LLM to generate rich SOUL.md / IDENTITY.md / USER.md content, then write to disk."""
    from app.models.llm_config import LLMConfig
    from app.services.agent.provider import get_chat_model
    from langchain_core.messages import HumanMessage

    # ── Resolve LLM config (user default → global default) ─────────────
    result = await db.execute(
        select(LLMConfig).where(
            LLMConfig.owner_id == current_user.id,
            LLMConfig.is_default.is_(True),
            LLMConfig.deleted_at.is_(None),
        )
    )
    llm_config = result.scalar_one_or_none()
    if not llm_config:
        result = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id.is_(None),
                LLMConfig.is_default.is_(True),
                LLMConfig.deleted_at.is_(None),
            )
        )
        llm_config = result.scalar_one_or_none()
    if not llm_config:
        raise NotFoundError("No LLM config available. Please configure an LLM first.")

    # ── Build the prompt ───────────────────────────────────────────────
    user_input_parts: list[str] = []
    if req.userName:     user_input_parts.append(f"用户姓名：{req.userName}")
    if req.timezone:     user_input_parts.append(f"用户时区：{req.timezone}")
    if req.notes.strip(): user_input_parts.append(f"用户备注：{req.notes.strip()}")
    if req.catName:      user_input_parts.append(f"猫咪昵称：{req.catName}")
    if req.bioType:      user_input_parts.append(f"生物类型：{req.bioType}")
    if req.vibe:         user_input_parts.append(f"气质风格：{req.vibe}")
    if req.catEmoji:     user_input_parts.append(f"代表 Emoji：{req.catEmoji}")
    if req.traits:       user_input_parts.append(f"性格特质：{'、'.join(req.traits)}")
    if req.replyStyle:   user_input_parts.append(f"回复风格：{req.replyStyle}")
    if req.customPrompt.strip():
        user_input_parts.append(f"自定义指令：{req.customPrompt.strip()}")

    custom_section = ""
    if req.customPrompt.strip():
        custom_section = f"\n# 自定义指令（Custom Instructions）\n{req.customPrompt.strip()}\n"

    prompt_text = _GENERATE_PERSONA_PROMPT.format(
        user_input="\n".join(user_input_parts) or "（用户未提供任何信息，请使用合理的默认值）",
        custom_instructions_section=custom_section,
        cat_name=req.catName or "NekoClaw",
        vibe=req.vibe or "友好专业",
        emoji=req.catEmoji or "🐱",
        user_name=req.userName or "用户",
        notes=req.notes.strip() or "（暂无备注）",
    )

    # ── Call LLM ────────────────────────────────────────────────────────
    chat_model = get_chat_model(llm_config)
    response = await chat_model.ainvoke([HumanMessage(content=prompt_text)])
    raw_text = response.content if isinstance(response.content, str) else str(response.content)

    # ── Parse three files from LLM output ──────────────────────────────
    files: dict[str, str] = {}
    for fname in ("SOUL.md", "IDENTITY.md", "USER.md"):
        marker = f"==={fname}==="
        idx = raw_text.find(marker)
        if idx == -1:
            continue
        start = idx + len(marker)
        # Find end: next marker or end of text
        end = len(raw_text)
        for other in ("SOUL.md", "IDENTITY.md", "USER.md"):
            if other == fname:
                continue
            other_marker = f"==={other}==="
            other_idx = raw_text.find(other_marker, start)
            if other_idx != -1 and other_idx < end:
                end = other_idx
        files[fname] = raw_text[start:end].strip()

    # ── Write files to disk ────────────────────────────────────────────
    user_dir = _user_memory_dir(current_user.id)
    written: list[str] = []
    for fname, content in files.items():
        if not content:
            continue
        sanitized = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', content)
        fpath = os.path.join(user_dir, fname)
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(sanitized)
        written.append(fname)
        logger.info("generate-persona: wrote %s for user %s", fname, current_user.id)

    return {"ok": True, "written": written}
