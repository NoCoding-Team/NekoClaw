"""
Admin API — user management, quota, skills, and system stats.
All endpoints require is_admin=True via require_admin dependency.
"""
import re
import shutil
import uuid
import zipfile
from datetime import date
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_admin
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.daily_usage import UserDailyUsage
from app.models.llm_config import LLMConfig
from app.models.message import Message
from app.models.session import Session
from app.models.skill_config import SkillConfig
from app.models.user import User
from app.schemas.admin import (
    AdminCreateUserRequest,
    AdminQuotaRequest,
    AdminSkillResponse,
    AdminSkillUpdateRequest,
    AdminStatsResponse,
    AdminUpdateUserRequest,
    AdminUserResponse,
)
from app.schemas.llm_config import LLMConfigCreate, LLMConfigResponse, LLMConfigUpdate
from app.services.skill_loader import (
    _SKILL_NAME_RE,
    _SKILLS_DIR,
    _parse_frontmatter,
    scan_skills,
)
from app.services.quota import quota_today

import yaml

router = APIRouter(prefix="/admin", tags=["admin"])

MAX_SKILL_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB


# ── Helpers ────────────────────────────────────────────────────────────────


def _today() -> date:
    return quota_today()


async def _get_user_or_404(user_id: str, db: AsyncSession) -> User:
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("用户不存在")
    return user


def _build_user_response(user: User, usage: UserDailyUsage | None) -> AdminUserResponse:
    return AdminUserResponse(
        id=user.id,
        username=user.username,
        nickname=user.nickname,
        is_admin=user.is_admin,
        daily_message_limit=user.daily_message_limit,
        daily_creation_limit=user.daily_creation_limit,
        messages_used_today=usage.messages_used if usage else 0,
        creation_used_today=usage.creation_used if usage else 0,
        created_at=user.created_at,
    )


# ── Stats ──────────────────────────────────────────────────────────────────


@router.get("/stats", response_model=AdminStatsResponse)
async def get_stats(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    today = _today()

    total_users_r = await db.execute(
        select(func.count()).select_from(User).where(User.deleted_at.is_(None))
    )
    total_users = total_users_r.scalar() or 0

    active_users_r = await db.execute(
        select(func.count(func.distinct(UserDailyUsage.user_id))).where(
            UserDailyUsage.date == today,
            UserDailyUsage.messages_used > 0,
        )
    )
    active_users_today = active_users_r.scalar() or 0

    msg_r = await db.execute(
        select(func.coalesce(func.sum(UserDailyUsage.messages_used), 0)).where(
            UserDailyUsage.date == today
        )
    )
    total_messages_today = msg_r.scalar() or 0

    creation_r = await db.execute(
        select(func.coalesce(func.sum(UserDailyUsage.creation_used), 0)).where(
            UserDailyUsage.date == today
        )
    )
    total_creation_today = creation_r.scalar() or 0

    return AdminStatsResponse(
        total_users=total_users,
        active_users_today=active_users_today,
        total_messages_today=total_messages_today,
        total_creation_today=total_creation_today,
    )


# ── User Management ────────────────────────────────────────────────────────


@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    today = _today()
    users_r = await db.execute(
        select(User).where(User.deleted_at.is_(None)).order_by(User.created_at)
    )
    users = users_r.scalars().all()

    usage_r = await db.execute(
        select(UserDailyUsage).where(UserDailyUsage.date == today)
    )
    usage_map = {u.user_id: u for u in usage_r.scalars().all()}

    return [_build_user_response(u, usage_map.get(u.id)) for u in users]


@router.post("/users", response_model=AdminUserResponse, status_code=201)
async def create_user(
    body: AdminCreateUserRequest,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(User).where(User.username == body.username, User.deleted_at.is_(None))
    )
    if existing.scalar_one_or_none():
        raise ConflictError("用户名已存在")

    user = User(
        id=str(uuid.uuid4()),
        username=body.username,
        hashed_password=hash_password(body.password),
        nickname=body.nickname,
        is_admin=body.is_admin,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _build_user_response(user, None)


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: str,
    body: AdminUpdateUserRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(user_id, db)

    if body.nickname is not None:
        user.nickname = body.nickname.strip() or None
    if body.password is not None:
        user.hashed_password = hash_password(body.password)
    if body.is_admin is not None:
        # Prevent admin from de-admining themselves
        if user.id == admin.id and not body.is_admin:
            raise HTTPException(status_code=400, detail="不能撤销自己的管理员权限")
        user.is_admin = body.is_admin

    await db.commit()
    await db.refresh(user)

    today = _today()
    usage_r = await db.execute(
        select(UserDailyUsage).where(
            UserDailyUsage.user_id == user_id, UserDailyUsage.date == today
        )
    )
    usage = usage_r.scalar_one_or_none()
    return _build_user_response(user, usage)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(user_id, db)
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")

    from datetime import datetime, timezone
    user.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.patch("/users/{user_id}/quota", response_model=AdminUserResponse)
async def update_user_quota(
    user_id: str,
    body: AdminQuotaRequest,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(user_id, db)

    if body.daily_message_limit is not None:
        user.daily_message_limit = body.daily_message_limit
    if body.daily_creation_limit is not None:
        user.daily_creation_limit = body.daily_creation_limit

    await db.commit()
    await db.refresh(user)

    today = _today()
    usage_r = await db.execute(
        select(UserDailyUsage).where(
            UserDailyUsage.user_id == user_id, UserDailyUsage.date == today
        )
    )
    usage = usage_r.scalar_one_or_none()
    return _build_user_response(user, usage)


@router.post("/users/{user_id}/quota/reset", status_code=204)
async def reset_user_quota(
    user_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_or_404(user_id, db)
    today = _today()
    usage_r = await db.execute(
        select(UserDailyUsage).where(
            UserDailyUsage.user_id == user_id, UserDailyUsage.date == today
        )
    )
    usage = usage_r.scalar_one_or_none()
    if usage:
        usage.messages_used = 0
        usage.creation_used = 0
        await db.commit()


# ── Skills Management ──────────────────────────────────────────────────────


def _skill_to_response(name: str) -> AdminSkillResponse | None:
    """Read a builtin skill from disk and return its response schema."""
    skill_dir = _SKILLS_DIR / name
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.exists():
        return None
    try:
        meta = _parse_frontmatter(skill_file, name, "builtin")
        return AdminSkillResponse(
            name=meta.name,
            description=meta.description,
            author=meta.author,
            version=meta.version,
            default_enabled=meta.default_enabled,
            triggers=meta.triggers,
            requires_tools=meta.requires_tools,
        )
    except Exception:
        return None


@router.get("/skills", response_model=list[AdminSkillResponse])
async def list_admin_skills(_: User = Depends(require_admin)):
    skills = scan_skills()
    result = []
    for name in sorted(skills.keys()):
        resp = _skill_to_response(name)
        if resp:
            result.append(resp)
    return result


@router.post("/skills", response_model=AdminSkillResponse, status_code=201)
async def upload_skill(
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
):
    """Upload a new builtin skill as ZIP (containing SKILL.md) or a bare SKILL.md."""
    content = await file.read()
    if len(content) > MAX_SKILL_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="文件过大，最大 10MB")

    filename = file.filename or ""

    if filename.endswith(".zip"):
        # Extract ZIP and find SKILL.md
        try:
            with zipfile.ZipFile(BytesIO(content)) as zf:
                names = zf.namelist()
                # Find SKILL.md — can be at root or in a single subfolder
                skill_mds = [n for n in names if n.endswith("SKILL.md") and "__MACOSX" not in n]
                if not skill_mds:
                    raise HTTPException(status_code=422, detail="ZIP 包中未找到 SKILL.md")

                # Determine skill name from directory structure
                skill_md_path = skill_mds[0]
                parts = skill_md_path.split("/")
                if len(parts) == 1:
                    # SKILL.md at root — need skill name from frontmatter
                    skill_content = zf.read(skill_md_path).decode("utf-8")
                    fm_match = re.search(r"^---\n(.*?)\n---", skill_content, re.DOTALL)
                    if not fm_match:
                        raise HTTPException(status_code=422, detail="SKILL.md 缺少 frontmatter")
                    fm = yaml.safe_load(fm_match.group(1))
                    skill_name = fm.get("name", "")
                    prefix = ""
                else:
                    skill_name = parts[0]
                    prefix = parts[0] + "/"

                if not skill_name or not _SKILL_NAME_RE.match(skill_name):
                    raise HTTPException(status_code=422, detail=f"无效的技能名称: {skill_name}")

                skill_dir = _SKILLS_DIR / skill_name
                skill_dir.mkdir(parents=True, exist_ok=True)

                # Extract all files under the skill folder
                for member in names:
                    if "__MACOSX" in member:
                        continue
                    if prefix and not member.startswith(prefix):
                        continue
                    rel = member[len(prefix):] if prefix else member
                    if not rel:
                        continue
                    target = skill_dir / rel
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(member) as src, open(target, "wb") as dst:
                        dst.write(src.read())
        except zipfile.BadZipFile:
            raise HTTPException(status_code=422, detail="无效的 ZIP 文件")

    elif filename.endswith(".md") or filename == "SKILL.md":
        skill_content = content.decode("utf-8")
        fm_match = re.search(r"^---\n(.*?)\n---", skill_content, re.DOTALL)
        if not fm_match:
            raise HTTPException(status_code=422, detail="SKILL.md 缺少 frontmatter")
        fm = yaml.safe_load(fm_match.group(1))
        skill_name = fm.get("name", "")
        if not skill_name or not _SKILL_NAME_RE.match(skill_name):
            raise HTTPException(status_code=422, detail=f"无效的技能名称: {skill_name}")

        skill_dir = _SKILLS_DIR / skill_name
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text(skill_content, encoding="utf-8")
    else:
        raise HTTPException(status_code=422, detail="只支持上传 .zip 或 .md 文件")

    resp = _skill_to_response(skill_name)
    if not resp:
        raise HTTPException(status_code=500, detail="技能上传后解析失败")
    return resp


@router.patch("/skills/{skill_name}", response_model=AdminSkillResponse)
async def update_skill_default(
    skill_name: str,
    body: AdminSkillUpdateRequest,
    _: User = Depends(require_admin),
):
    """Update the default_enabled frontmatter of a builtin skill."""
    skill_file = _SKILLS_DIR / skill_name / "SKILL.md"
    if not skill_file.exists():
        raise NotFoundError(f"技能 '{skill_name}' 不存在")

    text = skill_file.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise HTTPException(status_code=422, detail="SKILL.md 缺少 frontmatter")

    end = text.find("\n---", 3)
    if end == -1:
        raise HTTPException(status_code=422, detail="SKILL.md frontmatter 未闭合")

    fm = yaml.safe_load(text[3:end])
    fm["default_enabled"] = body.default_enabled

    new_fm = yaml.dump(fm, allow_unicode=True, default_flow_style=False).strip()
    new_text = f"---\n{new_fm}\n---{text[end + 4:]}"
    skill_file.write_text(new_text, encoding="utf-8")

    resp = _skill_to_response(skill_name)
    if not resp:
        raise HTTPException(status_code=500, detail="技能更新后解析失败")
    return resp


@router.delete("/skills/{skill_name}", status_code=204)
async def delete_skill(
    skill_name: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    skill_dir = _SKILLS_DIR / skill_name
    if not skill_dir.exists():
        raise NotFoundError(f"技能 '{skill_name}' 不存在")

    shutil.rmtree(skill_dir)

    # Clean up all users' SkillConfig records for this skill
    await db.execute(
        SkillConfig.__table__.delete().where(SkillConfig.skill_name == skill_name)
    )
    await db.commit()


# ── Global LLM Configs (admin-scoped view) ─────────────────────────────────

from app.core.security import encrypt_api_key  # noqa: E402


@router.get("/llm-configs", response_model=list[LLMConfigResponse])
async def admin_list_llm_configs(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LLMConfig)
        .where(LLMConfig.owner_id.is_(None), LLMConfig.deleted_at.is_(None))
        .order_by(LLMConfig.is_default.desc())
    )
    return result.scalars().all()


@router.post("/llm-configs", response_model=LLMConfigResponse, status_code=201)
async def admin_create_llm_config(
    body: LLMConfigCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.is_default:
        existing = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id.is_(None),
                LLMConfig.is_default.is_(True),
                LLMConfig.deleted_at.is_(None),
            )
        )
        for cfg in existing.scalars().all():
            cfg.is_default = False

    config = LLMConfig(
        id=str(uuid.uuid4()),
        provider=body.provider,
        name=body.name,
        model=body.model,
        api_key_encrypted=encrypt_api_key(body.api_key),
        base_url=body.base_url,
        is_default=body.is_default,
        context_limit=body.context_limit,
        temperature=body.temperature,
        owner_id=None,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.get("/llm-configs/{config_id}/api-key")
async def admin_get_llm_config_api_key(
    config_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LLMConfig).where(
            LLMConfig.id == config_id,
            LLMConfig.owner_id.is_(None),
            LLMConfig.deleted_at.is_(None),
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError("模型配置不存在")

    from app.core.security import decrypt_api_key

    return {"api_key": decrypt_api_key(config.api_key_encrypted)}


@router.patch("/llm-configs/{config_id}", response_model=LLMConfigResponse)
async def admin_update_llm_config(
    config_id: str,
    body: LLMConfigUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LLMConfig).where(
            LLMConfig.id == config_id,
            LLMConfig.owner_id.is_(None),
            LLMConfig.deleted_at.is_(None),
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError("模型配置不存在")

    if body.is_default is True:
        existing = await db.execute(
            select(LLMConfig).where(
                LLMConfig.owner_id.is_(None),
                LLMConfig.is_default.is_(True),
                LLMConfig.deleted_at.is_(None),
            )
        )
        for cfg in existing.scalars().all():
            cfg.is_default = False

    if body.name is not None:
        config.name = body.name
    if body.provider is not None:
        config.provider = body.provider
    if body.model is not None:
        config.model = body.model
    if body.api_key is not None and body.api_key.strip() != "":
        config.api_key_encrypted = encrypt_api_key(body.api_key)
    if body.base_url is not None:
        config.base_url = body.base_url
    if body.is_default is not None:
        config.is_default = body.is_default
    if body.context_limit is not None:
        config.context_limit = body.context_limit
    if body.temperature is not None:
        config.temperature = body.temperature

    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/llm-configs/{config_id}", status_code=204)
async def admin_delete_llm_config(
    config_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    result = await db.execute(
        select(LLMConfig).where(
            LLMConfig.id == config_id,
            LLMConfig.owner_id.is_(None),
            LLMConfig.deleted_at.is_(None),
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise NotFoundError("模型配置不存在")

    config.deleted_at = datetime.now(timezone.utc)
    await db.commit()
