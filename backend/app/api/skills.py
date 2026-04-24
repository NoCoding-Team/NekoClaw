"""
Skills management API — list, toggle, install, delete user skills.
"""
import os
import shutil
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.models.skill_config import SkillConfig
from app.models.user import User
from app.schemas.skill import SkillInfo, SkillToggle
from app.services.skill_loader import (
    scan_skills_for_user,
    ensure_user_skill_configs,
    refresh_skills_snapshot,
    _parse_frontmatter,
    _SKILLS_DIR,
    _SKILL_NAME_RE,
)

router = APIRouter(prefix="/skills", tags=["skills"])

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB


def _user_skills_dir(user_id: str) -> Path:
    d = Path(settings.SKILLS_FILES_DIR) / user_id
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.get("", response_model=list[SkillInfo])
async def list_skills(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all skills (builtin + user) with their enabled status."""
    await ensure_user_skill_configs(current_user.id, db)

    # Get all skill files
    all_skills = scan_skills_for_user(current_user.id)

    # Get DB config for enabled state
    result = await db.execute(
        select(SkillConfig).where(SkillConfig.user_id == current_user.id)
    )
    config_map = {c.skill_name: c for c in result.scalars().all()}

    # For user skills that exist on disk but not yet in DB, insert them
    for name, meta in all_skills.items():
        if name not in config_map:
            cfg = SkillConfig(
                user_id=current_user.id,
                skill_name=name,
                enabled=True,
                source=meta.source,
            )
            db.add(cfg)
            config_map[name] = cfg
    await db.commit()

    skills: list[SkillInfo] = []
    for name, meta in all_skills.items():
        cfg = config_map.get(name)
        skills.append(SkillInfo(
            key=name,
            name=meta.name,
            description=meta.description,
            version=meta.version,
            author=meta.author,
            source=meta.source,
            enabled=cfg.enabled if cfg else True,
            triggers=meta.triggers,
        ))

    return skills


@router.put("/{name}/toggle")
async def toggle_skill(
    name: str,
    body: SkillToggle,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a skill's enabled state."""
    result = await db.execute(
        select(SkillConfig).where(
            SkillConfig.user_id == current_user.id,
            SkillConfig.skill_name == name,
        )
    )
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="技能不存在")

    cfg.enabled = body.enabled
    await db.commit()
    return {"name": name, "enabled": cfg.enabled}


@router.post("/install", response_model=SkillInfo)
async def install_skill(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Install a skill from a ZIP file."""
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="仅支持 .zip 文件")

    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过 10MB 限制")

    # Extract ZIP to temp location to inspect
    try:
        zf = zipfile.ZipFile(BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="无效的 ZIP 文件")

    # Find the skill root: either top-level SKILL.md or inside a single subdirectory
    names = zf.namelist()
    skill_name: str | None = None
    skill_root_prefix = ""

    if "SKILL.md" in names:
        # SKILL.md at root — use zip filename (without .zip) as skill name
        skill_name = Path(file.filename).stem.lower().replace(" ", "-")
        skill_root_prefix = ""
    else:
        # Check for single top-level directory containing SKILL.md
        top_dirs = {n.split("/")[0] for n in names if "/" in n}
        for d in top_dirs:
            if f"{d}/SKILL.md" in names:
                skill_name = d.lower().replace(" ", "-")
                skill_root_prefix = d + "/"
                break

    if not skill_name:
        raise HTTPException(status_code=400, detail="ZIP 中未找到 SKILL.md")

    if not _SKILL_NAME_RE.match(skill_name):
        raise HTTPException(status_code=400, detail=f"无效的技能名称: {skill_name}")

    # Check conflicts: builtin takes precedence
    if (_SKILLS_DIR / skill_name).is_dir():
        raise HTTPException(status_code=409, detail=f"与内置技能 '{skill_name}' 同名，无法安装")

    user_dir = _user_skills_dir(current_user.id)
    target_dir = user_dir / skill_name
    if target_dir.exists():
        raise HTTPException(status_code=409, detail=f"技能 '{skill_name}' 已存在")

    # Extract
    target_dir.mkdir(parents=True, exist_ok=True)
    for member in zf.namelist():
        if member.endswith("/"):
            continue
        # Strip the root prefix if present
        rel = member[len(skill_root_prefix):] if skill_root_prefix and member.startswith(skill_root_prefix) else member
        if not rel:
            continue
        # Path traversal check
        normalized = os.path.normpath(rel)
        if normalized.startswith("..") or os.path.isabs(normalized):
            continue
        dest = target_dir / normalized
        dest.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(member) as src, open(dest, "wb") as dst:
            dst.write(src.read())

    # Parse SKILL.md
    skill_file = target_dir / "SKILL.md"
    if not skill_file.is_file():
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="解压后未找到 SKILL.md")

    meta = _parse_frontmatter(skill_file, skill_name, "user")

    # Upsert DB record — reinstalling an existing skill just re-enables it
    result = await db.execute(
        select(SkillConfig).where(
            SkillConfig.user_id == current_user.id,
            SkillConfig.skill_name == skill_name,
        )
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        cfg.enabled = True
        cfg.deleted_at = None
        cfg.source = "user"
    else:
        cfg = SkillConfig(
            user_id=current_user.id,
            skill_name=skill_name,
            enabled=True,
            source="user",
        )
        db.add(cfg)
    await db.commit()
    await refresh_skills_snapshot(current_user.id, db)

    return SkillInfo(
        key=skill_name,
        name=meta.name,
        description=meta.description,
        version=meta.version,
        author=meta.author,
        source="user",
        enabled=True,
        triggers=meta.triggers,
    )


@router.delete("/{name}")
async def delete_skill(
    name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user-installed skill. Builtin skills cannot be deleted."""
    result = await db.execute(
        select(SkillConfig).where(
            SkillConfig.user_id == current_user.id,
            SkillConfig.skill_name == name,
        )
    )
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="技能不存在")

    if cfg.source == "builtin":
        raise HTTPException(status_code=403, detail="内置技能不可删除")

    # Delete files
    user_dir = _user_skills_dir(current_user.id)
    skill_dir = user_dir / name
    if skill_dir.is_dir():
        shutil.rmtree(skill_dir, ignore_errors=True)

    # Delete DB record
    await db.execute(
        delete(SkillConfig).where(
            SkillConfig.user_id == current_user.id,
            SkillConfig.skill_name == name,
        )
    )
    await db.commit()
    await refresh_skills_snapshot(current_user.id, db)
    return {"detail": f"技能 '{name}' 已删除"}
