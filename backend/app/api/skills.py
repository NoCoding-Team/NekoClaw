import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user, require_admin
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.skill import Skill
from app.models.user import User
from app.schemas.skill import SkillCreate, SkillUpdate, SkillResponse

router = APIRouter(prefix="/skills", tags=["skills"])


async def _get_skill_or_404(skill_id: str, db: AsyncSession) -> Skill:
    skill = await db.get(Skill, skill_id)
    if not skill or skill.is_deleted:
        raise NotFoundError(f"Skill {skill_id} not found")
    return skill


@router.get("", response_model=list[SkillResponse])
async def list_skills(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List builtin skills + skills owned by current user."""
    result = await db.execute(
        select(Skill).where(
            Skill.deleted_at.is_(None),
            (Skill.is_builtin == True) | (Skill.owner_id == current_user.id),
        )
    )
    return result.scalars().all()


@router.post("", response_model=SkillResponse)
async def create_skill(
    payload: SkillCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    skill = Skill(
        id=str(uuid.uuid4()),
        owner_id=current_user.id,
        **payload.model_dump(),
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.put("/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: str,
    payload: SkillUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    skill = await _get_skill_or_404(skill_id, db)
    if skill.is_builtin and not current_user.is_admin:
        raise ForbiddenError("Cannot modify builtin skill")
    if skill.owner_id and skill.owner_id != current_user.id and not current_user.is_admin:
        raise ForbiddenError("Cannot modify another user's skill")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(skill, field, value)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.delete("/{skill_id}")
async def delete_skill(
    skill_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    skill = await _get_skill_or_404(skill_id, db)
    if skill.is_builtin:
        raise ForbiddenError("Cannot delete builtin skill")
    if skill.owner_id != current_user.id and not current_user.is_admin:
        raise ForbiddenError("Cannot delete another user's skill")

    from datetime import datetime, timezone
    skill.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Skill deleted"}
