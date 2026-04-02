import logging
from typing import Any

from app.services.safety.types import (
    AfterResult, BeforeAction, BeforeResult, RuntimeType, SecurityContext,
)

logger = logging.getLogger(__name__)

_kill_switch_active = False


def activate_kill_switch() -> None:
    global _kill_switch_active
    _kill_switch_active = True
    logger.warning("Safety layer kill switch ACTIVATED")


def deactivate_kill_switch() -> None:
    global _kill_switch_active
    _kill_switch_active = False
    logger.info("Safety layer kill switch deactivated")


def is_kill_switch_active() -> bool:
    return _kill_switch_active


async def evaluate_before(
    tool_name: str,
    params: dict[str, Any],
    *,
    instance_id: str = "",
    workspace_id: str = "",
    runtime: RuntimeType = RuntimeType.PYTHON,
) -> BeforeResult:
    if _kill_switch_active:
        return BeforeResult(action=BeforeAction.ALLOW, reason="kill_switch_active")
    ctx = SecurityContext(
        tool_name=tool_name, params=params,
        instance_id=instance_id, workspace_id=workspace_id, runtime=runtime,
    )
    return await _dispatch_evaluate_before(ctx)


async def evaluate_after(
    tool_name: str,
    params: dict[str, Any],
    *,
    exec_result: str | None = None,
    exec_error: str | None = None,
    duration_ms: float | None = None,
    instance_id: str = "",
    workspace_id: str = "",
    runtime: RuntimeType = RuntimeType.PYTHON,
) -> AfterResult:
    if _kill_switch_active:
        return AfterResult(reason="kill_switch_active")
    ctx = SecurityContext(
        tool_name=tool_name, params=params,
        instance_id=instance_id, workspace_id=workspace_id, runtime=runtime,
    )
    return await _dispatch_evaluate_after(ctx, exec_result, exec_error, duration_ms)


async def _dispatch_evaluate_before(ctx: SecurityContext) -> BeforeResult:
    return BeforeResult()


async def _dispatch_evaluate_after(
    ctx: SecurityContext,
    exec_result: str | None,
    exec_error: str | None,
    duration_ms: float | None,
) -> AfterResult:
    return AfterResult()
