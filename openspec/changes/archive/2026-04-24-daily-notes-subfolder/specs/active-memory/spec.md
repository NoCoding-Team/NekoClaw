## MODIFIED Requirements

### Requirement: Memory Refresh (Pre-Compaction)
`_memory_refresh` SHALL 引导 LLM 以整合模式维护 MEMORY.md、当日每日笔记和 USER.md。每日笔记路径 SHALL 使用 `notes/YYYY-MM-DD.md` 格式。

#### Scenario: Compaction 前记忆刷新
- **WHEN** `total_tokens > context_limit * COMPRESS_RATIO` 触发 compaction
- **THEN** 系统 SHALL 先执行 `_memory_refresh`，静默请求 LLM 调用 `memory_write` 以整合模式保存重要信息

#### Scenario: Refresh Prompt 整合模式
- **WHEN** Memory Refresh 执行时
- **THEN** 发给 LLM 的 prompt SHALL 引导 LLM：
  1. 先 `memory_read("MEMORY.md")`、`memory_read("notes/YYYY-MM-DD.md")`、`memory_read("USER.md")` 读取已有内容
  2. 对 MEMORY.md 执行整合：新信息追加、冲突信息更新、重复信息合并、过时信息删除
  3. 向当日笔记 `notes/YYYY-MM-DD.md` 追加对话要点
  4. 发现用户个人信息时更新 USER.md

#### Scenario: Memory Refresh 静默执行
- **WHEN** Memory Refresh 执行过程中
- **THEN** 系统 SHALL NOT 向用户 UI 发送可见消息

### Requirement: System Prompt Guidance
`_build_system_prompt` 的默认提示词中记忆使用规则 SHALL 使用 `notes/YYYY-MM-DD.md` 路径引导 LLM 写入每日笔记。

#### Scenario: 工具规则路径引导
- **WHEN** system prompt 包含工具使用规则（`_TOOL_RULES`）
- **THEN** 每日笔记路径说明 SHALL 使用 `notes/YYYY-MM-DD.md` 格式（如 `notes/2026-04-24.md`）

#### Scenario: 默认 AGENTS.md 模板路径
- **WHEN** 系统创建默认 AGENTS.md 模板（`_DEFAULT_AGENTS`）
- **THEN** 模板中每日笔记路径 SHALL 使用 `notes/YYYY-MM-DD.md` 格式
