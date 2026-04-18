"""
Sandbox guard: semantic danger analysis for tool calls.

Risk levels:
  DENY   - immediately blocked, never forwarded to PC
  HIGH   - forwarded to PC but requires explicit user confirmation
  MEDIUM - forwarded with warning, one-click confirm
  LOW    - forwarded silently
"""
import re
from typing import Any

# ── DENY patterns (catastrophic / system-destructive) ────────────────────────
_DENY_PATTERNS = [
    r"\brm\s+-[a-z]*r[a-z]*f\s+/",         # rm -rf /
    r"\brm\s+-rf\b",                         # rm -rf (any)
    r"\bformat\s+[a-z]:",                    # format C: / format D:
    r"\bdel\s+/[fsq]+\s+[a-z]:\\",          # del /f /s /q C:\
    r"\brd\s+/[sq]+\s+[a-z]:\\",            # rd /s /q C:\
    r"\bmkfs\b",                              # mkfs.*
    r"\bdd\s+if=.*of=/dev/(s|h)d[a-z]",     # dd if=... of=/dev/sda
    r":(){ :|:& };:",                        # fork bomb
    r"\bshutdown\b.*-[rh]",                  # shutdown -h / -r
    r"\bpoweroff\b",
    r"\breboot\b",
    r">\s*/dev/s[dh][a-z]",                 # redirect to raw disk
    r"\bwipe\b",
    r"\bsfdisk\b",
    r"\bparted\b.*rm\b",
]

# ── HIGH patterns (destructive operations) ───────────────────────────────────
_HIGH_PATTERNS = [
    r"\brm\b.*-[a-z]*[rf]",                 # rm with -r or -f flags
    r"\brmdir\b",
    r"\bdel\b",                              # del command (Windows)
    r"\btruncate\b",
    r"\bchmod\s+[0-7]*7[0-7]*\s+/",        # chmod 777 /...
    r"\bchown\b.*root",
    r"\bsudo\b",
    r"\bsu\b\s",
    r">\s*/etc/",                            # overwrite /etc files
    r">\s*/usr/",                            # overwrite /usr files
    r">\s*/boot/",
    r">\s*/bin/",
    r">\s*/sbin/",
    r"C:\\(Windows|System32|Program Files)\b",  # Windows system dirs
    r"\bnetsh\b.*firewall",
    r"\breg\s+(add|delete)\b",              # Registry modifications
]

# ── MEDIUM patterns (potentially impactful) ──────────────────────────────────
_MEDIUM_PATTERNS = [
    r"\bchmod\b",
    r"\bchown\b",
    r"\bcurl\b.*\|\s*(bash|sh|python)",     # pipe to shell
    r"\bwget\b.*\|\s*(bash|sh|python)",
    r"\beval\b",
    r"\bexec\b",
    r"\bkill\b",
    r"\bpkill\b",
    r"\bnpm\s+publish\b",
    r"\bgit\s+push\b.*--force",
    r"\bssh\b",
    r"\bscp\b",
]

_DENY_RE = [re.compile(p, re.IGNORECASE) for p in _DENY_PATTERNS]
_HIGH_RE = [re.compile(p, re.IGNORECASE) for p in _HIGH_PATTERNS]
_MEDIUM_RE = [re.compile(p, re.IGNORECASE) for p in _MEDIUM_PATTERNS]

# ── File path danger checks ───────────────────────────────────────────────────
_HIGH_FILE_PATHS = [
    r"^/$", r"^/etc", r"^/usr", r"^/bin", r"^/sbin", r"^/boot",
    r"^[A-Z]:\\Windows", r"^[A-Z]:\\System32", r"^[A-Z]:\\Program Files",
]
_HIGH_FILE_RE = [re.compile(p, re.IGNORECASE) for p in _HIGH_FILE_PATHS]


def _check_text(text: str, patterns: list) -> bool:
    return any(p.search(text) for p in patterns)


def analyze_risk(tool_name: str, args: dict[str, Any]) -> tuple[str, str]:
    """
    Returns (risk_level, reason).
    risk_level: "LOW" | "MEDIUM" | "HIGH" | "DENY"
    """
    if tool_name == "shell_exec":
        command = args.get("command", "")
        if _check_text(command, _DENY_RE):
            return "DENY", f"Command matches catastrophic-risk pattern: {command[:80]}"
        if _check_text(command, _HIGH_RE):
            return "HIGH", f"Command contains potentially destructive operation: {command[:80]}"
        if _check_text(command, _MEDIUM_RE):
            return "MEDIUM", f"Command contains potentially impactful operation: {command[:80]}"
        return "LOW", ""

    elif tool_name in ("file_delete", "file_write"):
        path = args.get("path", "")
        if _check_text(path, _HIGH_FILE_RE):
            return "HIGH", f"Operation on system-critical path: {path}"
        if tool_name == "file_delete":
            return "HIGH", f"File deletion: {path}"
        return "LOW", ""

    elif tool_name == "file_read":
        return "LOW", ""

    elif tool_name == "fetch_url":
        return "LOW", ""

    return "LOW", ""
