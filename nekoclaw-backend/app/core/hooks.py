from __future__ import annotations

import contextvars
import logging
from collections import defaultdict
from typing import Any, Callable

logger = logging.getLogger(__name__)

HookHandler = Callable[..., Any]

_handlers: dict[str, list[HookHandler]] = defaultdict(list)

_operation_audited: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "_operation_audited", default=False,
)


def register(event: str, handler: HookHandler) -> None:
    _handlers[event].append(handler)


async def emit(event: str, **kwargs: Any) -> None:
    for handler in _handlers.get(event, []):
        try:
            result = handler(**kwargs)
            if hasattr(result, "__await__"):
                await result
        except Exception:
            logger.exception("Hook handler error: event=%s handler=%s", event, handler.__name__)


def clear(event: str | None = None) -> None:
    if event:
        _handlers.pop(event, None)
    else:
        _handlers.clear()


def mark_audited() -> None:
    _operation_audited.set(True)


def is_audited() -> bool:
    return _operation_audited.get()


def reset_audited() -> None:
    _operation_audited.set(False)
