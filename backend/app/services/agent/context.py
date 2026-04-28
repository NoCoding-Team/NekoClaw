"""
Context management for the LangGraph Agent.

Migrated from services/llm.py:
  - Token estimation
  - Tool result truncation / soft-trim / 3-tier pruning
  - History compression (summarisation via LLM)
  - Memory refresh (proactive memory writing via sub-LLM call)
  - System prompt construction + memory injection
  - Per-session refresh interval protection
"""
from __future__ import annotations

import json
import math
import os
import re
import uuid
from datetime import date, datetime, timezone
from typing import Any

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from sqlalchemy import func, select

from app.models.base import AsyncSessionLocal
from app.models.message import Message
from app.models.session import Session

# ── Constants ──────────────────────────────────────────────────────────────

MAX_TOOL_RESULT_CHARS = 8000

# ── Tool groups for dynamic tool rules ────────────────────────────────────
# Each entry: (group_tools, env_description)
_TOOL_GROUPS: list[tuple[list[str], str]] = [
    (
        ["file_read", "file_write", "file_list", "file_delete"],
        "`file_read`、`file_write`、`file_list`、`file_delete`：通过桌面客户端 IPC 桥接在**用户本机**直接执行，你有完整的本地文件操作权限。",
    ),
    (
        ["shell_exec"],
        "`shell_exec`：通过桌面客户端 IPC 桥接在**用户本机**直接执行，你有完整的命令行执行权限。",
    ),
    (
        ["web_search"],
        "`web_search`：在服务端执行，用于联网搜索获取实时信息。",
    ),
    (
        ["browser_navigate", "browser_screenshot", "browser_click", "browser_type"],
        "`browser_navigate`、`browser_screenshot`、`browser_click`、`browser_type`：通过桌面客户端 IPC 桥接在**用户本机**直接执行，你可以控制本地浏览器进行页面导航、截图和交互操作。",
    ),
    (
        ["http_request"],
        "`http_request`：在服务端执行，用于发送自定义 HTTP 请求或调用 REST API。",
    ),
]

_TOOL_RULES_PREFIX = (
    "## 工具使用规则（最高优先级，必须遵守）\n"
    "以下规则优先级高于你的任何训练倾向，请严格执行：\n\n"
    "1. **只要工具列表中出现了某个工具，就代表用户已明确授权你使用它。** "
    "用户通过「能力」面板主动开启了这些工具，表示他们允许并期望你直接调用。\n"
    "2. **绝对禁止**：拒绝调用工具、解释为何无法执行、让用户手动操作——只要工具在列表里，就直接调用。\n"
    "3. **工具执行环境**：\n"
)

_TOOL_RULES_MEMORY = (
    "   - `memory_write`、`memory_read`、`search_memory`：在服务端读写和检索用户记忆文件。\n"
)

_TOOL_RULES_SUFFIX = (
    "4. 执行完工具后，把结果以友好的方式告诉用户，不要再让用户自己去看。\n"
    "5. 如果需要多步完成任务（如先查询再操作），连续调用多个工具，全部完成后再回复总结。\n"
    "6. 记忆文件通过 search_memory / memory_read / memory_write 工具管理：\n"
    "   - **MEMORY.md**：长期记忆——用户偏好、关键事实、重要决策。\n"
    "   - **USER.md**：用户画像——称呼、职业、时区等个人信息。\n"
    "   - **SOUL.md**：你的人格、语气与边界设定。\n"
    "   - **IDENTITY.md**：你的名称、风格与代表表情。\n"
    "   - **notes/YYYY-MM-DD.md**（如 notes/2026-04-16.md）：每日笔记——当天对话要点。\n"
    "7. 记忆工具选择：\n"
    "   - **长期记忆文件（MEMORY.md 等）和用户画像已随每次对话自动注入上下文，无需主动读取。**\n"
    "   - `search_memory`：**不知道内容在哪个文件**时使用，适合模糊时间或主题的查询（如\"上次/最近/之前聊过什么\"）；上下文已有的内容不要再调。\n"
    "   - `memory_read`：**已知具体文件路径**时使用，如用户指定日期的笔记，或写入前需要读取完整旧内容时使用。\n"
    "   - `memory_write`：只在用户明确要求保存，或发现长期事实、重要决策、稳定偏好并完成整理后写回完整文件时使用。\n"
)


def _build_tool_rules(allowed_tools: list[str] | None) -> str:
    """Build tool rules dynamically based on the enabled tool list.

    When ``allowed_tools`` is ``None`` (full-access mode) all tool groups are
    included, preserving the original behaviour.  Otherwise only groups that
    have at least one tool present in ``allowed_tools`` are described so the
    LLM is not told about capabilities that have been disabled by the user.
    Memory tools (memory_read / memory_write / search_memory) are always
    included regardless of ``allowed_tools``.
    """
    lines: list[str] = [_TOOL_RULES_PREFIX]
    for group_tools, env_desc in _TOOL_GROUPS:
        if allowed_tools is None or any(t in allowed_tools for t in group_tools):
            lines.append(f"   - {env_desc}\n")
    # Memory tools are always present
    lines.append(_TOOL_RULES_MEMORY)
    lines.append(_TOOL_RULES_SUFFIX)
    return "".join(lines)


_DEFAULT_PERSONA = "你是一只聪明可爱的猫咪助手，叫做 NekoClaw。请用中文回复用户。"

# ── Persona file default templates ──────────────────────────────────────────

_DEFAULT_SOUL = (
    "# 人格\n"
    "- 你是一只聪明可爱的猫咪助手，叫做 NekoClaw\n"
    "- 友好、专业、严谨，适应性强\n\n"
    "# 语气\n"
    "- 友好而专业，避免过于复杂的术语\n"
    "- 正向鼓励，提供建设性反馈\n"
    "- 请用中文回复用户\n\n"
    "# 边界\n"
    "- 保护用户隐私，不主动收集敏感信息\n"
    "- 超出能力范围时诚实告知\n"
    "- 遵循道德规范和法律规定\n"
)

_DEFAULT_IDENTITY = (
    "# 名称（Name）\n"
    "- **名称**：NekoClaw\n"
    "NekoClaw 是一只聪明可爱的猫咪助手，敏捷灵活。\n\n"
    "# 风格（Vibe）\n"
    "- **风格**：友好专业\n"
    "风格以现代科技感为主，简洁且功能直观。\n\n"
    "# 表情（Emoji）\n"
    "- **表情**：🐱\n"
    "用猫咪表情代表智能助手的灵动特质。\n"
)

_DEFAULT_USER = (
    "# 用户画像\n"
    "<!-- 以下内容由 NekoClaw 在对话中自动学习填充，你也可以手动编辑 -->\n\n"
    "## 基本信息\n"
    "- 称呼：（待学习）\n\n"
    "## 偏好\n"
    "- （待学习）\n\n"
    "## 常用技术栈\n"
    "- （待学习）\n"
)

_DEFAULT_AGENTS = (
    "# 操作指令\n\n"
    "## 优先级\n"
    "- 安全 > 效率 > 体验\n\n"
    "## 记忆策略\n"
    "- 重要决策、用户偏好、关键事实写入 MEMORY.md\n"
    "- 当日对话要点写入 notes/YYYY-MM-DD.md\n"
    "- 发现用户个人信息（称呼、职业、时区等）时更新 USER.md\n\n"
    "## 何时写入记忆（发现以下情况时立即执行）\n"
    "- 用户透露偏好（语言、格式、工具选择、沟通风格等）→ 写入 MEMORY.md\n"
    "- 用户提到关于自己的重要事实（职业、项目、技术栈、习惯等）→ 写入 MEMORY.md\n"
    "- 用户的个人信息（称呼、职业、时区等）→ 更新 USER.md\n"
    "- 用户做出重要决策或给出关键指令 → 写入 MEMORY.md\n"
    "- 用户纠正之前的错误信息 → 读取并更新对应文件\n"
    "- 对话产生有价值的结论、方案、要点 → 写入当日 notes/YYYY-MM-DD.md\n"
    "- 用户明确要求\"记住...\"、\"下次...\" → 写入 MEMORY.md\n\n"
    "## 写入流程\n"
    "1. 仅在确定需要写入时，先 memory_read 读取目标文件已有内容\n"
    "2. 整合新信息到已有内容中（更新冲突项、合并重复项，而非简单追加）\n"
    "3. 用 memory_write 写回完整内容\n\n"
    "## 不需要写入的内容\n"
    "- 当前任务的临时中间步骤\n"
    "- 大段代码或文件内容原文\n"
    "- 定时任务自动执行产生的天气、提醒、状态查询等临时输出，除非用户明确要求记住\n\n"
    "## 行为规则\n"
    "- 优先使用内置工具完成任务\n"
    "- 高风险操作前需要用户确认\n"
    "- 不确定时主动询问而非猜测\n"
)

_SKILL_SYSTEM_RULES = (
    "## 技能系统使用规则\n"
    "你拥有一组可用技能（listed in <available_skills>）。技能是教你完成特定任务的操作指南。\n\n"
    "### 使用流程\n"
    "1. **意图匹配**：根据用户请求，从 <available_skills> 中识别最匹配的技能（参考 name、description、triggers）。\n"
    "2. **读取技能**：调用 `read_skill(location=\"<location>\")` 获取完整的 SKILL.md 内容。"
    "其中 `<location>` 是 <available_skills> 中该技能的 <location> 字段值（文件完整路径）。\n"
    "3. **按步骤执行**：严格遵循 SKILL.md 中描述的步骤，使用指定的工具完成任务。\n"
    "4. **汇总结果**：所有步骤完成后，用自然语言向用户汇总结果。\n\n"
    "### 注意事项\n"
    "- `read_skill` 是内置工具，始终可用，无需额外开启。\n"
    "- 必须将 <location> 字段的完整路径值原样传入 `read_skill`，不要自行拼接或修改路径。\n"
    "- 如果没有匹配的技能，直接用你的知识回答用户，不需要勉强匹配。\n"
    "- 不要编造不存在的技能路径。\n"
)

# ── Token estimation ────────────────────────────────────────────────────────


def estimate_tokens(text: str) -> int:
    """Estimate token count from text length (Chinese/English mixed heuristic)."""
    return math.ceil(len(text) * 0.6)


# ── Tool result helpers ────────────────────────────────────────────────────


def _truncate_tool_result(result: str) -> str:
    """Truncate a tool result for LLM context (keeps head + tail)."""
    if len(result) <= MAX_TOOL_RESULT_CHARS:
        return result
    return result[:6000] + "\n...[输出过长已截断]...\n" + result[-1500:]


def _soft_trim(content: str) -> str:
    if len(content) <= 500:
        return content
    return content[:300] + "\n...[已裁剪]...\n" + content[-200:]


# ── 3-tier tool result pruning (LangChain message list) ─────────────────────


def prune_tool_results(messages: list[BaseMessage]) -> list[BaseMessage]:
    """Prune ToolMessage content by distance from current round (3-tier strategy).

    Recent <3 rounds: keep (soft-trim if >4000 chars)
    4–8 rounds:       soft-trim
    >8 rounds:        hard-clear to "[工具输出已省略]"
    """
    max_tool_result_tokens = 4000

    round_index = [0] * len(messages)
    current_round = 0
    for i in range(len(messages) - 1, -1, -1):
        round_index[i] = current_round
        if isinstance(messages[i], AIMessage):
            current_round += 1

    result: list[BaseMessage] = []
    for i, m in enumerate(messages):
        if not isinstance(m, ToolMessage):
            result.append(m)
            continue

        distance = round_index[i]
        content = m.content if isinstance(m.content, str) else str(m.content)

        if distance < 3:
            if len(content) > max_tool_result_tokens:
                result.append(ToolMessage(content=_soft_trim(content), tool_call_id=m.tool_call_id))
            else:
                result.append(m)
        elif distance < 8:
            result.append(ToolMessage(content=_soft_trim(content), tool_call_id=m.tool_call_id))
        else:
            result.append(ToolMessage(content="[工具输出已省略]", tool_call_id=m.tool_call_id))

    return result


# ── ORM → LangChain message conversion ─────────────────────────────────────


def to_lc_message(m: Any) -> BaseMessage:
    """Convert a Message ORM object to a LangChain BaseMessage."""
    content: str = m.content or ""

    if m.role == "user":
        return HumanMessage(content=content)
    if m.role == "system":
        return SystemMessage(content=content)
    if m.role == "tool":
        return ToolMessage(content=content, tool_call_id=m.tool_call_id or "")

    # assistant — restore reasoning_content into additional_kwargs so provider can
    # inject it back into the serialized payload for DeepSeek thinking-mode.
    additional_kwargs: dict[str, Any] = {}
    rc = getattr(m, "reasoning_content", None)
    if rc:
        additional_kwargs["reasoning_content"] = rc

    if m.tool_calls:
        lc_tool_calls: list[dict[str, Any]] = []
        for tc in m.tool_calls:
            if "function" in tc:
                # OpenAI format: {id, type, function: {name, arguments}}
                try:
                    args = json.loads(tc["function"].get("arguments", "{}"))
                except Exception:
                    args = {}
                lc_tool_calls.append(
                    {
                        "id": tc.get("id", ""),
                        "name": tc["function"]["name"],
                        "args": args,
                        "type": "tool_call",
                    }
                )
        if lc_tool_calls:
            return AIMessage(content=content, tool_calls=lc_tool_calls, additional_kwargs=additional_kwargs)

    return AIMessage(content=content, additional_kwargs=additional_kwargs)


# ── System prompt construction ─────────────────────────────────────────────


def _load_persona_file(user_id: str, filename: str, default_template: str) -> str:
    """Load a persona file, creating it with default template if missing. Truncate at 4000 chars."""
    from app.core.config import settings

    user_dir = os.path.join(settings.MEMORY_FILES_DIR, user_id)
    os.makedirs(user_dir, exist_ok=True)
    fpath = os.path.join(user_dir, filename)
    if not os.path.isfile(fpath):
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(default_template)
        return default_template
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        return default_template
    if len(content) > 4000:
        content = content[:4000] + "\n...(已截断)"
    return content


async def build_system_prompt(
    user_id: str,
    allowed_tools: list[str] | None,
    db: Any = None,
    query_hint: str = "",
    session_source: str = "chat",
    memory_policy: str = "auto",
) -> str:
    """Build the system prompt including persona files, tool rules, skill catalog, and injected memories."""
    from app.services.skill_loader import build_available_skills_prompt

    # 1. SOUL.md (persona)
    soul = _load_persona_file(user_id, "SOUL.md", _DEFAULT_SOUL)

    # 2. IDENTITY.md (name, vibe, emoji)
    identity = _load_persona_file(user_id, "IDENTITY.md", _DEFAULT_IDENTITY)

    # 3. USER.md (user profile)
    user_profile = _load_persona_file(user_id, "USER.md", _DEFAULT_USER)

    # 4. AGENTS.md (operating instructions)
    agents = _load_persona_file(user_id, "AGENTS.md", _DEFAULT_AGENTS)

    # 5. Assemble base prompt: SOUL → IDENTITY → USER → AGENTS → TOOL_RULES
    base = (
        soul
        + "\n\n## 身份\n" + identity
        + "\n\n## 用户画像\n" + user_profile
        + "\n\n" + agents
        + "\n\n" + _build_tool_rules(allowed_tools)
    )

    # 5. Skill catalog and rules
    if db:
        skills_prompt = await build_available_skills_prompt(user_id, allowed_tools, db)
    else:
        skills_prompt = ""
    if skills_prompt:
        base += "\n\n" + _SKILL_SYSTEM_RULES + "\n" + skills_prompt

    if session_source == "scheduled_task":
        base += (
            "\n\n## 定时任务执行规则\n"
            "- 当前会话由系统按计划自动触发，不是用户正在进行的普通对话。\n"
            "- **严禁**向用户提出任何问题或请求补充信息。任务描述即完整指令，请根据记忆中已知的用户信息（城市、偏好等）直接执行；若信息不足，使用合理默认值完成任务，不得等待用户回复。\n"
            "- 默认把本次输出视为临时执行结果，不主动写入长期记忆或每日笔记。\n"
            "- 只有任务描述或用户后续明确要求\"记住\"\"保存到长期记忆\"时，才允许使用记忆写入工具。\n"
            f"- 当前记忆策略：{memory_policy}。"
        )

    # 6. Memory injection (Markdown memory files; daily notes are on-demand only)
    memory_context = await _load_memory(user_id, query_hint)
    if memory_context:
        base += f"\n\n## 关于用户的记忆\n{memory_context}"
    return base


async def _load_memory(user_id: str, query_hint: str = "") -> str:
    """Load memory for the user from Markdown files, with DB fallback."""
    from app.core.config import settings  # late import to avoid circular deps

    user_dir = os.path.join(settings.MEMORY_FILES_DIR, user_id)
    parts: list[str] = []

    # Long-term memory: load directly unless MEMORY.md is larger than the token budget.
    memory_md = os.path.join(user_dir, "MEMORY.md")
    if os.path.isfile(memory_md):
        with open(memory_md, encoding="utf-8") as f:
            content = f.read().strip()
        if content:
            if estimate_tokens(content) > 4000 and query_hint:
                # RAG mode: search MEMORY.md for chunks relevant to the current query.
                try:
                    from app.services.memory_search import search_memory as _search_mem

                    results = await _search_mem(user_id, query_hint, top_k=10)
                    memory_hits = [
                        r for r in results
                        if _normalize_memory_path(str(r.get("file_path", ""))) == "MEMORY.md"
                    ]
                    if memory_hits:
                        rag_text = "\n\n".join(r["content"] for r in memory_hits)
                        rag_text = _truncate_to_token_budget(rag_text, 4000)
                        parts.append(rag_text)
                    else:
                        # RAG returned nothing, fallback to truncation
                        parts.append(_truncate_to_token_budget(content, 4000))
                except Exception:
                    parts.append(_truncate_to_token_budget(content, 4000))
            elif estimate_tokens(content) > 4000:
                # No query hint available, fallback to truncation
                parts.append(_truncate_to_token_budget(content, 4000))
            else:
                parts.append(content)

    # Other Markdown memory files are loaded directly, except persona files already
    # included above and daily notes which stay on-demand.
    for rel_path, abs_path in _iter_extra_memory_markdown_files(user_dir):
        with open(abs_path, encoding="utf-8") as f:
            text = f.read().strip()
        if text:
            parts.append(f"## {rel_path}\n{text}")

    # Daily notes are retrieved on demand; never inject today/yesterday in full by default.
    if _should_search_daily_notes(query_hint):
        try:
            from app.services.memory_search import search_memory as _search_mem

            results = await _search_mem(user_id, query_hint, top_k=8)
            note_hits = [
                r for r in results
                if _is_daily_note_path(str(r.get("file_path", "")))
            ]
            if note_hits:
                rag_text = "\n\n".join(
                    f"### {r.get('file_path', 'daily note')}\n{r['content']}"
                    for r in note_hits
                )
                if estimate_tokens(rag_text) > 4000:
                    rag_text = _truncate_to_token_budget(rag_text, 4000)
                parts.append("## 每日笔记检索片段\n" + rag_text)
        except Exception:
            pass

    if parts:
        return "\n\n".join(parts)

    # Fallback: DB-based legacy memory
    from app.models.memory import Memory
    from sqlalchemy import func as sqlfunc

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Memory)
            .where(Memory.user_id == user_id, Memory.deleted_at.is_(None))
            .order_by(sqlfunc.coalesce(Memory.last_used_at, Memory.created_at).desc())
            .limit(50)
        )
        entries = result.scalars().all()
        now = datetime.now(timezone.utc)
        for e in entries:
            e.last_used_at = now
        await db.commit()

    if not entries:
        return ""
    return "\n".join(f"[{e.category}] {e.content}" for e in entries)


def _should_search_daily_notes(query_hint: str) -> bool:
    if not query_hint:
        return False
    hint = query_hint.lower()
    keywords = (
        "今天", "昨天", "前天", "最近", "上次", "之前", "历史", "记录",
        "笔记", "日报", "每日", "聊过", "提过", "记得", "回顾",
    )
    return any(k in hint for k in keywords) or bool(re.search(r"\d{4}-\d{1,2}-\d{1,2}", hint))


def _is_daily_note_path(path: str) -> bool:
    normalized = _normalize_memory_path(path)
    return bool(re.match(r"^(notes/)?\d{4}-\d{2}-\d{2}\.md$", normalized))


def _normalize_memory_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")


def _truncate_to_token_budget(text: str, max_tokens: int) -> str:
    if estimate_tokens(text) <= max_tokens:
        return text
    # estimate_tokens uses len * 0.6, so this keeps roughly max_tokens.
    max_chars = max(1, math.floor(max_tokens / 0.6))
    return text[:max_chars] + "\n...(已截断)"


def _iter_extra_memory_markdown_files(user_dir: str) -> list[tuple[str, str]]:
    if not os.path.isdir(user_dir):
        return []

    already_loaded = {"MEMORY.md", "SOUL.md", "IDENTITY.md", "USER.md", "AGENTS.md"}
    files: list[tuple[str, str]] = []
    for dirpath, _dirnames, filenames in os.walk(user_dir):
        for filename in filenames:
            if not filename.endswith(".md"):
                continue
            abs_path = os.path.join(dirpath, filename)
            rel_path = _normalize_memory_path(os.path.relpath(abs_path, user_dir))
            if rel_path in already_loaded or _is_daily_note_path(rel_path):
                continue
            files.append((rel_path, abs_path))
    return sorted(files, key=lambda item: item[0])


# ── Memory refresh ──────────────────────────────────────────────────────────

_REFRESH_INTERVAL = 15   # trigger every N user turns
_REFRESH_MIN_GAP = 5     # minimum turns between refreshes
_last_refresh_turn: dict[str, int] = {}


def _can_refresh(session_id: str, current_turn: int) -> bool:
    last_turn = _last_refresh_turn.get(session_id, -_REFRESH_MIN_GAP)
    return (current_turn - last_turn) >= _REFRESH_MIN_GAP


def _mark_refresh_done(session_id: str, current_turn: int) -> None:
    _last_refresh_turn[session_id] = current_turn


async def memory_refresh(
    session_id: str,
    user_id: str,
    history: list[Any],  # list[Message ORM]
    llm_config: Any | None,
    query_hint: str = "",
) -> None:
    """Proactively save important memories before history is compressed.

    Uses a sub-LLM call (non-streaming, max 3 tool rounds).
    Best-effort: never raises exceptions to the caller.
    """
    if not llm_config:
        return

    async with AsyncSessionLocal() as db:
        session = await db.get(Session, session_id)
        if session and session.memory_policy in {"read_only", "no_write"}:
            return

    user_turn_count = sum(1 for m in history if hasattr(m, "role") and m.role == "user")
    if not _can_refresh(session_id, user_turn_count):
        return
    _mark_refresh_done(session_id, user_turn_count)

    recent = history[-20:]
    conv_text = "\n".join(f"{m.role}: {m.content or ''}" for m in recent)
    existing = await _load_memory(user_id, query_hint)
    existing_block = f"\n\n已有记忆:\n{existing}" if existing else ""

    today = date.today().isoformat()
    refresh_messages: list[BaseMessage] = [
        SystemMessage(
            content=(
                "你是记忆整理助手。请检查以下对话，将值得保存的信息整合到记忆文件中。\n\n"
                "## 操作步骤\n"
                "1. memory_read(\"MEMORY.md\") 读取长期记忆\n"
                f"2. memory_read(\"notes/{today}.md\") 读取今日笔记\n"
                "3. memory_read(\"USER.md\") 读取用户画像\n"
                "4. 分析对话，与已有记忆对比后执行整合：\n"
                "   - 新发现的信息 → 追加到对应分区\n"
                "   - 已有但发生变化的信息 → 就地更新（如\"住在北京\"→\"搬到杭州\"）\n"
                "   - 重复信息 → 合并为一条\n"
                "   - 被明确否定/过时的信息 → 删除\n"
                "   - 保持 MEMORY.md 的 ## 分区结构\n"
                "5. 用户偏好、关键事实、重要决策 → 整合到 MEMORY.md\n"
                f"6. 今日对话要点、讨论话题、结论 → 整合到 notes/{today}.md\n"
                "7. 用户个人信息（称呼、职业、时区等）→ 更新 USER.md\n"
                "8. 用 memory_write 写回整合后的完整内容\n\n"
                "不需要保存：临时中间步骤、大段代码原文。"
                + existing_block
            )
        ),
        HumanMessage(content=f"请分析以下对话：\n\n{conv_text}"),
    ]

    from app.services.agent.tools import get_tools
    from app.services.tools.server_tools import execute_server_tool

    memory_tool_list = get_tools(["memory_read", "memory_write", "search_memory"], None, user_id)

    try:
        from app.services.agent.provider import get_chat_model

        # Non-streaming model for silent sub-call
        llm_config_no_stream = llm_config  # streaming flag only affects callbacks, not ainvoke batch
        model = get_chat_model(llm_config_no_stream)
        if memory_tool_list:
            model = model.bind_tools(memory_tool_list)

        messages: list[BaseMessage] = list(refresh_messages)
        for _ in range(3):  # max 3 tool-call rounds
            resp = await model.ainvoke(messages)
            if not resp.tool_calls:
                break
            messages.append(resp)
            for tc in resp.tool_calls:
                result = await execute_server_tool(tc["name"], tc["args"], user_id)
                messages.append(ToolMessage(content=result, tool_call_id=tc["id"]))
    except Exception:
        pass  # best-effort: never surface to caller


def should_run_periodic_refresh(session_id: str, user_turn_count: int) -> bool:
    """True when a periodic memory refresh should be triggered."""
    return (
        user_turn_count > 0
        and user_turn_count % _REFRESH_INTERVAL == 0
        and _can_refresh(session_id, user_turn_count)
    )
