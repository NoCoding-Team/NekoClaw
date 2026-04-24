"""
Instruction-Following Agent Skills — Loader
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

import yaml

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_SKILLS_DIR = Path(__file__).resolve().parent.parent.parent / "skills"
_SKILL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


@dataclass(frozen=True)
class SkillMeta:
    name: str
    description: str
    triggers: list[str] = field(default_factory=list)
    requires_tools: list[str] = field(default_factory=list)
    author: str = "system"
    version: str = "1.0"
    path: str = ""  # absolute path to the skill directory
    source: str = "builtin"  # "builtin" | "user"


# ── Scanning ───────────────────────────────────────────────────────────────


def _scan_dir(root: Path, source: str) -> dict[str, SkillMeta]:
    """Scan a single skills directory, returning parsed SkillMeta per folder."""
    result: dict[str, SkillMeta] = {}
    if not root.is_dir():
        return result
    for entry in sorted(root.iterdir()):
        if not entry.is_dir():
            continue
        skill_file = entry / "SKILL.md"
        if not skill_file.is_file():
            continue
        name = entry.name
        if not _SKILL_NAME_RE.match(name):
            logger.warning("Skipping skill with invalid name: %s", name)
            continue
        try:
            meta = _parse_frontmatter(skill_file, name, source)
            result[name] = meta
        except Exception:
            logger.exception("Failed to parse skill: %s", name)
    return result


def scan_skills_for_user(user_id: str | None = None) -> dict[str, SkillMeta]:
    """Scan builtin + user skills directories, returning merged metadata.

    Builtin skills take precedence over user skills with the same name.
    """
    # Always include builtin
    result = _scan_dir(_SKILLS_DIR, "builtin")

    # Merge user skills if user_id provided
    if user_id:
        from app.core.config import settings
        user_dir = Path(settings.SKILLS_FILES_DIR) / user_id
        user_skills = _scan_dir(user_dir, "user")
        for name, meta in user_skills.items():
            if name not in result:  # builtin takes precedence
                result[name] = meta

    return result


# Keep legacy scan_skills for startup (no user context)
def scan_skills(skills_dir: str | Path | None = None) -> dict[str, SkillMeta]:
    """Scan ``skills/`` directory for SKILL.md files (startup / builtin only)."""
    root = Path(skills_dir) if skills_dir else _SKILLS_DIR
    result = _scan_dir(root, "builtin")
    logger.info("Scanned %d builtin skills from %s", len(result), root)
    return result


def get_all_skills() -> dict[str, SkillMeta]:
    """Return builtin skills (for backward compat)."""
    return _scan_dir(_SKILLS_DIR, "builtin")


# ── Per-user DB helpers ────────────────────────────────────────────────────


async def ensure_user_skill_configs(user_id: str, db: AsyncSession) -> None:
    """Ensure the user has DB records for all builtin skills.

    Missing builtin skills are inserted with enabled=true.
    Uses ON CONFLICT DO NOTHING to handle concurrent calls.
    """
    from sqlalchemy import text

    builtin = _scan_dir(_SKILLS_DIR, "builtin")
    if not builtin:
        return

    # Batch insert with conflict ignore
    for name in builtin:
        await db.execute(
            text(
                "INSERT INTO skills_config (user_id, skill_name, enabled, source, created_at, updated_at) "
                "VALUES (:uid, :name, true, 'builtin', NOW(), NOW()) "
                "ON CONFLICT (user_id, skill_name) DO NOTHING"
            ),
            {"uid": user_id, "name": name},
        )
    await db.commit()


async def get_enabled_skills_for_user(
    user_id: str, db: AsyncSession
) -> dict[str, SkillMeta]:
    """Return only enabled skills for a user (file must also exist)."""
    from sqlalchemy import select
    from app.models.skill_config import SkillConfig

    result = await db.execute(
        select(SkillConfig.skill_name).where(
            SkillConfig.user_id == user_id,
            SkillConfig.enabled.is_(True),
        )
    )
    enabled_names = {row[0] for row in result.all()}

    all_skills = scan_skills_for_user(user_id)
    return {n: m for n, m in all_skills.items() if n in enabled_names}


async def build_available_skills_prompt(
    user_id: str,
    allowed_tools: list[str] | None,
    db: AsyncSession,
) -> str:
    """Build ``<available_skills>`` XML block filtered by enabled + allowed_tools."""
    await ensure_user_skill_configs(user_id, db)
    skills = await get_enabled_skills_for_user(user_id, db)
    if not skills:
        return ""

    lines: list[str] = ["<available_skills>"]
    for skill_key, meta in skills.items():
        if not _skill_is_available(meta, allowed_tools):
            continue
        skill_md_path = str(Path(meta.path) / "SKILL.md")
        lines.append("  <skill>")
        lines.append(f"    <name>{meta.name}</name>")
        lines.append(f"    <description>{meta.description}</description>")
        if meta.triggers:
            lines.append(f"    <triggers>{', '.join(meta.triggers)}</triggers>")
        lines.append(f"    <location>{skill_md_path}</location>")
        lines.append("  </skill>")
    lines.append("</available_skills>")

    if len(lines) == 2:
        return ""
    xml = "\n".join(lines)

    # Persist snapshot to user memory dir so it appears in MemoryPanel
    _write_skills_snapshot(user_id, xml)

    return xml


async def refresh_skills_snapshot(user_id: str, db: AsyncSession) -> None:
    """Regenerate SKILLS_SNAPSHOT.md after skill list changes (install / delete)."""
    await build_available_skills_prompt(user_id, allowed_tools=None, db=db)


def _write_skills_snapshot(user_id: str, xml_block: str) -> None:
    """Write SKILLS_SNAPSHOT.md to the user's memory directory."""
    from app.core.config import settings

    user_dir = os.path.join(settings.MEMORY_FILES_DIR, user_id)
    os.makedirs(user_dir, exist_ok=True)
    content = (
        "# 可用技能列表（Skills Snapshot）\n\n"
        "> 此文件由系统在每次会话开始时自动生成，列出了当前启用的全部技能。\n"
        "> 手动编辑此文件不会生效——技能的启用/禁用请通过「技能库」页面管理。\n\n"
        f"{xml_block}\n"
    )
    fpath = os.path.join(user_dir, "SKILLS_SNAPSHOT.md")
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(content)


def read_skill_by_location(location: str, user_id: str | None = None) -> str:
    """Read a skill file by its absolute path with security validation.

    The ``location`` must point to a file inside one of the known skills
    directories (builtin or the requesting user's directory).
    """
    target = Path(location).resolve()

    # Build the set of allowed roots
    allowed_roots: list[Path] = [_SKILLS_DIR.resolve()]
    if user_id:
        from app.core.config import settings
        user_skills_root = (Path(settings.SKILLS_FILES_DIR) / user_id).resolve()
        allowed_roots.append(user_skills_root)

    for root in allowed_roots:
        try:
            target.relative_to(root)  # raises ValueError if not under root
            if target.is_file():
                return target.read_text(encoding="utf-8")
        except ValueError:
            continue

    raise FileNotFoundError(f"Skill file not found or access denied: {location}")


def read_skill_content(skill_name: str, file: str = "SKILL.md", user_id: str | None = None) -> str:
    """Read a skill file by name with path-traversal protection (legacy helper).

    Search order: builtin → user directory.
    """
    if not _SKILL_NAME_RE.match(skill_name):
        raise ValueError(f"Invalid skill name: {skill_name}")

    # Normalize and validate file path
    normalized = os.path.normpath(file)
    if normalized.startswith("..") or os.sep + ".." in normalized or os.path.isabs(normalized):
        raise ValueError("Path traversal not allowed")

    # Try builtin first
    builtin_dir = (_SKILLS_DIR / skill_name).resolve()
    if builtin_dir.is_dir():
        target = (builtin_dir / normalized).resolve()
        if str(target).startswith(str(builtin_dir) + os.sep) or target == builtin_dir:
            if target.is_file():
                return target.read_text(encoding="utf-8")

    # Then try user directory
    if user_id:
        from app.core.config import settings
        user_skill_dir = (Path(settings.SKILLS_FILES_DIR) / user_id / skill_name).resolve()
        if user_skill_dir.is_dir():
            target = (user_skill_dir / normalized).resolve()
            if str(target).startswith(str(user_skill_dir) + os.sep) or target == user_skill_dir:
                if target.is_file():
                    return target.read_text(encoding="utf-8")

    raise FileNotFoundError(f"Skill not found: {skill_name}")


# ── Internal helpers ──────────────────────────────────────────────────────


def _parse_frontmatter(skill_file: Path, name: str, source: str = "builtin") -> SkillMeta:
    """Parse YAML frontmatter from a SKILL.md file."""
    text = skill_file.read_text(encoding="utf-8")

    if not text.startswith("---"):
        raise ValueError(f"SKILL.md for '{name}' missing YAML frontmatter")

    end = text.find("\n---", 3)
    if end == -1:
        raise ValueError(f"SKILL.md for '{name}' has unclosed frontmatter")

    fm = yaml.safe_load(text[3:end])
    if not isinstance(fm, dict):
        raise ValueError(f"SKILL.md for '{name}' has invalid frontmatter")

    return SkillMeta(
        name=fm.get("name", name),
        description=fm.get("description", ""),
        triggers=[str(t) for t in fm.get("triggers", [])],
        requires_tools=[str(t) for t in fm.get("requires_tools", [])],
        author=fm.get("author", "system"),
        version=str(fm.get("version", "1.0")),
        path=str(skill_file.parent),
        source=source,
    )


def _skill_is_available(meta: SkillMeta, allowed_tools: list[str] | None) -> bool:
    """Check if all tools required by a skill are within allowed_tools."""
    if allowed_tools is None:
        return True
    if not meta.requires_tools:
        return True
    return all(t in allowed_tools for t in meta.requires_tools)
