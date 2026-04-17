"""
LangChain BaseTool wrappers for NekoClaw tools.

Design:
  - Each tool is a lightweight _SchemaTool whose sole purpose is to provide the
    correct schema for model.bind_tools() so the LLM knows which tools are
    available and what arguments to supply.
  - Actual tool execution (server-side calls, WebSocket client bridges, sandbox
    checks, WS events) is handled directly in nodes.py/tools_node, where call_id
    and ws context are available.
  - get_tools() is the public API used by nodes.py to obtain tool instances.
"""
from __future__ import annotations

from typing import Any, Optional, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field, create_model

from app.services.tools.definitions import TOOL_DEFINITIONS

# ── Schema helpers ─────────────────────────────────────────────────────────

_TYPE_MAP: dict[str, type] = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
    "object": dict,
    "array": list,
}


def _build_args_schema(tool_name: str, parameters: dict) -> Type[BaseModel]:
    """Dynamically build a Pydantic model from a JSON Schema parameters block."""
    props: dict[str, Any] = parameters.get("properties", {})
    required: list[str] = parameters.get("required", [])
    fields: dict[str, Any] = {}

    for field_name, prop in props.items():
        py_type: type = _TYPE_MAP.get(prop.get("type", "string"), str)
        desc: str = prop.get("description", "")

        if field_name in required:
            fields[field_name] = (py_type, Field(description=desc))
        else:
            default_val = prop.get("default", None)
            fields[field_name] = (Optional[py_type], Field(default=default_val, description=desc))

    model_name = "".join(word.title() for word in tool_name.split("_")) + "Args"
    return create_model(model_name, **fields)


# ── Schema-only tool class ──────────────────────────────────────────────────


class _SchemaTool(BaseTool):
    """Lightweight tool used exclusively to generate the JSON schema for bind_tools().

    The tools_node in nodes.py performs actual execution directly without
    going through _run/_arun, so these raise NotImplementedError if called.
    """

    name: str
    description: str
    args_schema: Type[BaseModel]

    class Config:
        arbitrary_types_allowed = True

    def _run(self, *args: Any, **kwargs: Any) -> str:  # pragma: no cover
        raise NotImplementedError("Use the tools_node for execution")

    async def _arun(self, *args: Any, **kwargs: Any) -> str:  # pragma: no cover
        raise NotImplementedError("Use the tools_node for execution")


# ── Public API ─────────────────────────────────────────────────────────────


def get_tools(
    allowed_tools: list[str] | None,
    ws: Any,  # noqa: ARG001 – kept for API symmetry; needed by nodes.py context
    user_id: str | None,  # noqa: ARG001
) -> list[BaseTool]:
    """Return BaseTool instances for bind_tools(), filtered by allowlist.

    Args:
        allowed_tools: None → all tools, [] → no tools, [...] → specific tools.
        ws: passed for API symmetry (used by nodes.py).
        user_id: passed for API symmetry (used by nodes.py).
    """
    if allowed_tools is not None and len(allowed_tools) == 0:
        return []

    tools_to_use = (
        TOOL_DEFINITIONS
        if allowed_tools is None
        else [t for t in TOOL_DEFINITIONS if t["name"] in allowed_tools]
    )

    return [
        _SchemaTool(
            name=t["name"],
            description=t["description"],
            args_schema=_build_args_schema(t["name"], t["parameters"]),
        )
        for t in tools_to_use
    ]
