"""
Public tool API — endpoints accessible without admin privileges.
"""
from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.services.tools.definitions import TOOL_DEFINITIONS
from app.services.tools.tool_config_service import get_globally_disabled_tools

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("/enabled")
async def list_enabled_tools(
    _user: User = Depends(get_current_user),
) -> list[str]:
    """Return list of globally enabled tool names."""
    disabled = await get_globally_disabled_tools()
    return [t["name"] for t in TOOL_DEFINITIONS if t["name"] not in disabled]
