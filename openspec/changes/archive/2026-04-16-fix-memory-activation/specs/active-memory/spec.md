## MODIFIED Requirements

### Requirement: System Prompt Guidance
`_build_system_prompt` 的默认提示词中记忆使用规则 SHALL 采用主动引导策略，明确区分 MEMORY.md 和每日笔记的使用场景。

#### Scenario: 默认模式记忆指引
- **WHEN** 非 Skill 模式构建 system prompt
- **THEN** system prompt SHALL 包含主动引导的记忆使用规则，明确以下行为：
  - 发现用户偏好、重要事实、关键决策时 SHALL 调用 `memory_write` 写入 MEMORY.md
  - 对话产生有价值的要点、结论时 SHALL 调用 `memory_write` 写入当日 YYYY-MM-DD.md
  - 写入前 SHALL 先 `memory_read` 读取已有内容，追加而非覆写
  - 不 SHALL 包含"每轮最多 N 次"的调用频率限制

#### Scenario: 前后端引导一致
- **WHEN** 前端 `MEMORY_GUIDANCE` 和后端 `_TOOL_RULES` 分别构建记忆引导文本
- **THEN** 两端 SHALL 使用语义一致的记忆引导策略（措辞可根据上下文微调，但规则含义相同）

### Requirement: Memory Refresh (Pre-Compaction)
`_memory_refresh` SHALL 同时引导 LLM 维护 MEMORY.md 和当日每日笔记，且不受每 session 仅一次的限制。

#### Scenario: Compaction 前记忆刷新
- **WHEN** `total_tokens > context_limit * COMPRESS_RATIO` 触发 compaction
- **THEN** 系统 SHALL 先执行 `_memory_refresh`，静默请求 LLM 调用 `memory_write` 保存重要信息

#### Scenario: Refresh Prompt 同时维护两类记忆
- **WHEN** Memory Refresh 执行时
- **THEN** 发给 LLM 的 prompt SHALL 引导 LLM：
  1. 先 `memory_read("MEMORY.md")` 和 `memory_read("YYYY-MM-DD.md")` 读取已有内容
  2. 向 MEMORY.md 追加/更新长期关键信息（用户偏好、重要事实、关键决策）
  3. 向当日笔记追加对话要点、讨论话题、结论

#### Scenario: 不再限制每会话一次
- **WHEN** 当前会话已经执行过 Memory Refresh
- **THEN** 系统 SHALL 仍允许后续 Memory Refresh 执行（受最小轮次间隔保护约束）

#### Scenario: Memory Refresh 静默执行
- **WHEN** Memory Refresh 执行过程中
- **THEN** 系统 SHALL NOT 向用户 UI 发送可见消息，不在聊天气泡中显示 Memory Refresh 的中间过程
