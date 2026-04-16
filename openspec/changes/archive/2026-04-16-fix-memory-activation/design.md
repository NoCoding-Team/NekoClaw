## Context

NekoClaw 的记忆框架（MEMORY.md + 每日笔记 + memory_write/read/search 工具）已完整实现，但实际运行中记忆几乎不产生。当前用户的 MEMORY.md 仅有 4 行 122 字节，每日笔记从未被创建。经过对 OpenClaw 的参照分析和根因排查，确认是四个互相叠加的缺陷导致记忆系统处于"名义可用但实际静默"状态。

**当前代码路径**：
- 前端 Mode B：`desktop/src/hooks/useLocalLLM.ts` → `sendMessage()` → agentic loop + `memoryRefresh()` + `compactHistory()`
- 后端 Mode A：`backend/app/services/llm.py` → `run_llm_pipeline()` → `_build_system_prompt()` + `_memory_refresh()` + `_compress_history()`
- 记忆引导：前端 `MEMORY_GUIDANCE` 常量 + 后端 `_TOOL_RULES` 字符串
- 记忆文件：`{userData}/memory/` 目录下的 `.md` 文件

## Goals / Non-Goals

**Goals:**
- 让 LLM 在正常对话中自然积累长期记忆和每日笔记，无需用户手动干预
- Mode B 的 tool call 功能恢复正常——LLM 能看到自己之前的工具调用结果
- Memory Refresh 在合理频率下自动触发，而非几乎永远不触发
- 前后端（Mode A / Mode B）行为保持一致

**Non-Goals:**
- Dreaming / 后台记忆提炼（后续独立变更）
- Embedding / Rerank 模型的实际启用（当前记忆量过小，不是瓶颈）
- Memory Panel UI 改动
- 数据库 Schema 或 API 接口变更
- 记忆去重 / 合并逻辑

## Decisions

### D1: Mode B 消息历史保留 tool 消息

**选择**：修改 `useLocalLLM.ts` 中构建 LLM 上下文的 filter 逻辑，保留 `role: 'tool'` 消息和带 `tool_calls` 的 assistant 消息。

**当前问题**：`messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim() !== '')` 丢弃了所有工具消息，导致 LLM 永远看不到工具调用链路。

**方案**：改为保留 user / assistant / tool 三种 role，仅过滤空内容的纯文本消息。对 assistant 消息，有 `tool_calls` 字段时即使 content 为空也保留。

**替代方案考虑**：
- 仅在 memory 工具调用时保留 → 过于复杂，且其他工具（如 search）也需要上下文
- 全部保留不做任何过滤 → 可能引入系统内部消息噪音，不如精确过滤

### D2: 记忆引导从被动改主动

**选择**：重写 `MEMORY_GUIDANCE`（前端）和 `_TOOL_RULES`（后端）中的记忆规则段落。

**当前问题**：规则以限制为主调（"不要保存临时信息""每轮最多3次"），LLM 默认选择不写。

**新策略**：
1. 明确分工：MEMORY.md = 长期关键信息（用户偏好、重要事实），YYYY-MM-DD.md = 当日对话要点
2. 积极引导："发现以下情况时 SHALL 调用 memory_write"而非"可以保存"
3. 去掉"每轮最多 3 次"限制（本身没有意义，LLM 不会滥用）
4. 保留"先 memory_read 再追加"的工作流指导
5. 前后端文本保持语义一致

### D3: Memory Refresh 多触发源

**选择**：引入基于轮次的定期触发，保留原有 compaction 前触发，去掉"每 session 仅 1 次"限制。

**当前问题**：仅在 `total_tokens > context_limit * 0.70 AND len(history) > 10` 时触发，128K 模型下约需 90K token。加上 `_memory_refresh_done` set 限制每 session 只触发一次。

**新触发策略**：
1. **轮次触发**：每 15 轮用户消息触发一次（`user_turn_count % 15 === 0`，第 15、30、45…轮）
2. **Compaction 前触发**：保留原逻辑——compaction 前先 refresh（去掉一次性限制）
3. 去掉 `_memory_refresh_done` set，改用 `_last_refresh_turn` 计数器防止短时间内重复触发（两次 refresh 间隔至少 5 轮）

**替代方案考虑**：
- 基于时间间隔（每 10 分钟）→ 实现复杂，用户可能长时间不发消息
- 基于 token 增量（每增加 5000 token）→ 不直观，需要持续计算
- 会话结束时触发 → 桌面应用无可靠的"会话结束"事件，暂不实现

### D4: Memory Refresh Prompt 同时维护两类记忆

**选择**：更新 refresh 时发给 LLM 的 prompt，明确要求同时检查并更新 MEMORY.md 和当日 YYYY-MM-DD.md。

**当前 prompt**：仅引导写 MEMORY.md，不提每日笔记。

**新 prompt 要点**：
1. 先 `memory_read("MEMORY.md")` 检查已有内容
2. 先 `memory_read("YYYY-MM-DD.md")` 检查今日笔记
3. 对 MEMORY.md：提取/更新用户偏好、关键事实、重要决策
4. 对 YYYY-MM-DD.md：追加今日对话要点、讨论话题、结论
5. 使用追加而非覆写（先读后写）

## Risks / Trade-offs

- **[消息历史膨胀]** → tool 消息保留会增加上下文占用。**缓解**：已有的 Session Pruning 和 Compaction 机制会处理，且 tool 消息本身会被 pruning 规则截断。
- **[LLM 过度写入]** → 引导变积极后 LLM 可能频繁写记忆。**缓解**：Memory Refresh 的间隔保护（至少 5 轮），且 LLM 自身有上下文判断能力；MEMORY.md 有 4000 token 注入上限防止无限增长。
- **[前后端不一致]** → Mode A 和 Mode B 的引导文本/触发逻辑需同步修改。**缓解**：tasks 中明确列出两端对应修改项，确保语义一致。
- **[Refresh 质量依赖 LLM 能力]** → 如果用户用较弱的模型，refresh 可能提取不出有意义的信息。**缓解**：这是记忆系统的固有限制，prompt 清晰能帮助大多数模型。
