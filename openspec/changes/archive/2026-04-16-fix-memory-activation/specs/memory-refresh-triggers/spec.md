## ADDED Requirements

### Requirement: 轮次触发 Memory Refresh
系统 SHALL 在用户消息轮次达到指定间隔时自动触发 Memory Refresh，而非仅依赖 compaction 前触发。

#### Scenario: 第 15 轮消息触发
- **WHEN** 当前会话的用户消息轮次计数为 15 的整数倍（15、30、45…）
- **THEN** 系统 SHALL 在处理 LLM 响应前执行一次 Memory Refresh

#### Scenario: 间隔保护
- **WHEN** 距上次 Memory Refresh 执行不足 5 轮用户消息
- **THEN** 系统 SHALL 跳过本次轮次触发的 Memory Refresh

#### Scenario: 前后端一致
- **WHEN** Mode A 后端或 Mode B 前端的 agentic loop 处理用户消息
- **THEN** 两端 SHALL 使用相同的轮次间隔（15）和最小间隔保护（5）逻辑

### Requirement: 去掉每 session 仅一次限制
系统 SHALL 允许同一会话内多次执行 Memory Refresh，以轮次间隔作为频率控制手段。

#### Scenario: 同一会话多次 refresh
- **WHEN** 一个会话中用户消息轮次分别到达 15 和 30
- **THEN** 系统 SHALL 在两个时机各执行一次 Memory Refresh

#### Scenario: Compaction 前仍然触发
- **WHEN** compaction 条件满足但本会话已执行过轮次触发的 refresh
- **THEN** 系统 SHALL 仍然在 compaction 前执行 refresh（受最小间隔保护约束）
