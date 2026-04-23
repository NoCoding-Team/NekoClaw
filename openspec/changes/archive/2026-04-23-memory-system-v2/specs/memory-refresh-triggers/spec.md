## MODIFIED Requirements

### 轮次触发 Memory Refresh

系统 SHALL 在用户消息轮次达到指定间隔时自动触发 Memory Refresh（整合模式），而非仅依赖 compaction 前触发。

#### Scenario: 第 15 轮消息触发
- **WHEN** 当前会话的用户消息轮次计数为 15 的整数倍（15、30、45…）
- **THEN** 系统 SHALL 在处理 LLM 响应前执行一次整合式 Memory Refresh（去重、冲突消解、过时删除）

#### Scenario: 间隔保护
- **WHEN** 距上次 Memory Refresh 执行不足 5 轮用户消息
- **THEN** 系统 SHALL 跳过本次轮次触发的 Memory Refresh

#### Scenario: 前后端一致
- **WHEN** Mode A 后端或 Mode B 前端的 agentic loop 处理用户消息
- **THEN** 两端 SHALL 使用相同的轮次间隔（15）和最小间隔保护（5）逻辑，且均使用整合模式 prompt
