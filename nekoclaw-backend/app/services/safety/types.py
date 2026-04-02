from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class BeforeAction(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    MODIFY = "modify"


class AfterAction(str, Enum):
    PASS = "pass"
    REDACT = "redact"
    FLAG = "flag"


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RuntimeType(str, Enum):
    TYPESCRIPT = "typescript"
    PYTHON = "python"
    RUST = "rust"


@dataclass
class Finding:
    plugin_id: str
    category: str
    severity: Severity
    message: str
    detail: dict[str, Any] | None = None


@dataclass
class BeforeResult:
    action: BeforeAction = BeforeAction.ALLOW
    reason: str | None = None
    message: str | None = None
    modified_params: dict[str, Any] | None = None
    findings: list[Finding] = field(default_factory=list)


@dataclass
class AfterResult:
    action: AfterAction = AfterAction.PASS
    reason: str | None = None
    message: str | None = None
    modified_result: str | None = None
    findings: list[Finding] = field(default_factory=list)


@dataclass
class SecurityContext:
    tool_name: str
    params: dict[str, Any]
    instance_id: str = ""
    workspace_id: str = ""
    runtime: RuntimeType = RuntimeType.PYTHON
    timestamp: float = 0.0
