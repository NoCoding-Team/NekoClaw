"""
Instruction-Following Agent Skills — Loader
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

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


# Module-level cache populated by scan_skills()
_cache: dict[str, SkillMeta] = {}


def scan_skills(skills_dir: str | Path | None = None) -> dict[str, SkillMeta]:
    """Scan ``skills/`` directory for SKILL.md files and cache frontmatter."""
    global _cache
    root = Path(skills_dir) if skills_dir else _SKILLS_DIR

    if not root.is_dir():
        logger.warning("Skills directory not found: %s", root)
        _cache = {}
        return _cache

    result: dict[str, SkillMeta] = {}
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
            meta = _parse_frontmatter(skill_file, name)
            result[name] = meta
            logger.info("Loaded skill: %s", name)
        except Exception:
            logger.exception("Failed to parse skill: %s", name)

    _cache = result
    logger.info("Scanned %d skills from %s", len(_cache), root)
    return _cache


def get_all_skills() -> dict[str, SkillMeta]:
    """Return the cached skill metadata."""
    return _cache


def build_available_skills_prompt(allowed_tools: list[str] | None) -> str:
    """Build ``<available_skills>`` XML block filtered by allowed_tools."""
    skills = _cache
    if not skills:
        return ""

    lines: list[str] = ["<available_skills>"]
    for meta in skills.values():
        if not _skill_is_available(meta, allowed_tools):
            continue
        lines.append("  <skill>")
        lines.append(f"    <name>{meta.name}</name>")
        lines.append(f"    <description>{meta.description}</description>")
        if meta.triggers:
            lines.append(f"    <triggers>{', '.join(meta.triggers)}</triggers>")
        lines.append("  </skill>")
    lines.append("</available_skills>")

    # If no skills are available after filtering, return empty
    if len(lines) == 2:  # only the wrapper tags
        return ""
    return "\n".join(lines)


def read_skill_content(skill_name: str, file: str = "SKILL.md") -> str:
    """Read a skill file with path-traversal protection.

    Returns the file content as a string, or raises ValueError on invalid input.
    """
    if not _SKILL_NAME_RE.match(skill_name):
        raise ValueError(f"Invalid skill name: {skill_name}")

    skill_dir = (_SKILLS_DIR / skill_name).resolve()
    if not skill_dir.is_dir():
        raise FileNotFoundError(f"Skill not found: {skill_name}")

    # Normalize and validate file path
    normalized = os.path.normpath(file)
    if normalized.startswith("..") or os.sep + ".." in normalized or os.path.isabs(normalized):
        raise ValueError("Path traversal not allowed")

    target = (skill_dir / normalized).resolve()
    # Ensure resolved path is within the skill directory
    if not str(target).startswith(str(skill_dir) + os.sep) and target != skill_dir:
        raise ValueError("Path traversal not allowed")

    if not target.is_file():
        raise FileNotFoundError(f"File not found: {skill_name}/{file}")

    return target.read_text(encoding="utf-8")


# ── Internal helpers ──────────────────────────────────────────────────────


def _parse_frontmatter(skill_file: Path, name: str) -> SkillMeta:
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
    )


def _skill_is_available(meta: SkillMeta, allowed_tools: list[str] | None) -> bool:
    """Check if all tools required by a skill are within allowed_tools."""
    # None means all tools allowed → skill is always available
    if allowed_tools is None:
        return True
    if not meta.requires_tools:
        return True
    return all(t in allowed_tools for t in meta.requires_tools)
