"""
Tool configuration service — global enable/disable and credential management.

Provides in-process cache for global tool states to avoid DB queries on every
agent invocation.  Admin API calls invalidate_cache() after mutations.
"""
from __future__ import annotations

import json
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decrypt_api_key, encrypt_api_key
from app.models.base import AsyncSessionLocal
from app.models.tool_config import ToolConfig

# ── In-process cache ───────────────────────────────────────────────────────

_cache: dict[str, Any] | None = None
_cache_ts: float = 0.0
_CACHE_TTL = 300  # seconds


def invalidate_cache() -> None:
    """Clear the in-process cache. Called by admin API after mutations."""
    global _cache, _cache_ts
    _cache = None
    _cache_ts = 0.0


async def _load_all_configs() -> dict[str, ToolConfig]:
    """Load all tool_configs rows into a dict keyed by tool_name."""
    global _cache, _cache_ts
    now = time.monotonic()
    if _cache is not None and (now - _cache_ts) < _CACHE_TTL:
        return _cache

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(ToolConfig))
            rows = {tc.tool_name: tc for tc in result.scalars().all()}
    except Exception:
        # Table may not exist yet (before first restart after migration)
        rows = {}

    _cache = rows
    _cache_ts = now
    return rows


# ── Public API ─────────────────────────────────────────────────────────────

# Mapping from credential key → settings attribute name (for .env fallback)
_ENV_FALLBACK: dict[str, str] = {
    "TAVILY_API_KEY": "TAVILY_API_KEY",
    "EMBEDDING_API_KEY": "EMBEDDING_API_KEY",
}


async def get_globally_disabled_tools() -> set[str]:
    """Return the set of tool names that are globally disabled by admin."""
    configs = await _load_all_configs()
    return {name for name, tc in configs.items() if not tc.enabled}


async def get_tool_credential(tool_name: str, key: str) -> str | None:
    """Get a credential value for a tool.

    Priority: DB (encrypted) → .env settings → None
    """
    configs = await _load_all_configs()
    tc = configs.get(tool_name)
    if tc and tc.credentials:
        try:
            creds = json.loads(decrypt_api_key(tc.credentials))
            value = creds.get(key)
            if value:
                return value
        except Exception:
            pass  # Decryption or parse error — fall through to env

    # Fallback to .env
    env_attr = _ENV_FALLBACK.get(key)
    if env_attr:
        value = getattr(settings, env_attr, None)
        if value:
            return value

    return None


async def set_tool_config(
    db: AsyncSession,
    tool_name: str,
    *,
    enabled: bool | None = None,
    credentials: dict[str, str] | None = None,
) -> ToolConfig:
    """Create or update a tool_config row. Encrypts credentials before storing."""
    result = await db.execute(
        select(ToolConfig).where(ToolConfig.tool_name == tool_name)
    )
    tc = result.scalar_one_or_none()

    if tc is None:
        tc = ToolConfig(tool_name=tool_name)
        db.add(tc)

    if enabled is not None:
        tc.enabled = enabled

    if credentials is not None:
        # Merge with existing credentials (don't wipe unset keys)
        existing: dict[str, str] = {}
        if tc.credentials:
            try:
                existing = json.loads(decrypt_api_key(tc.credentials))
            except Exception:
                pass
        existing.update(credentials)
        tc.credentials = encrypt_api_key(json.dumps(existing))

    await db.flush()
    invalidate_cache()
    return tc


async def get_tool_config(tool_name: str) -> ToolConfig | None:
    """Get a single tool config from cache."""
    configs = await _load_all_configs()
    return configs.get(tool_name)


async def is_tool_enabled(tool_name: str) -> bool:
    """Check if a tool is globally enabled (default True if not in DB)."""
    configs = await _load_all_configs()
    tc = configs.get(tool_name)
    if tc is None:
        return True
    return tc.enabled
