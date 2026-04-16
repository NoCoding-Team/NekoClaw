## MODIFIED Requirements

### Requirement: Agentic Loop
`useLocalLLM` 的 `sendMessage` SHALL 在构建 LLM 上下文时保留完整的工具调用链路消息，包括 `role: 'tool'` 消息和带 `tool_calls` 的 assistant 消息。

#### Scenario: 多轮工具调用
- **WHEN** LLM 返回 tool_calls（如 `memory_write`）
- **THEN** 系统 SHALL 执行工具、将 assistant message（含 tool_calls）和 tool result message 追加到 messages，再次调用 LLM 流式获取下一轮响应

#### Scenario: 历史消息保留工具调用链路
- **WHEN** `sendMessage` 从本地存储加载历史消息构建 LLM 上下文
- **THEN** 系统 SHALL 保留 `role: 'user'`、`role: 'assistant'`（包括带 `tool_calls` 且 content 为空的）和 `role: 'tool'` 三种角色的消息
- **THEN** 系统 SHALL 仅过滤 `role: 'assistant'` 且 content 为空且没有 `tool_calls` 的消息

#### Scenario: 轮次上限保护
- **WHEN** agentic loop 执行轮次达到 `MAX_TOOL_ROUNDS`（默认 10）
- **THEN** 系统 SHALL 终止循环并向用户显示警告消息

#### Scenario: 循环守卫
- **WHEN** agentic loop 中检测到 LLM 重复调用相同工具形成循环
- **THEN** 系统 SHALL 按 `securityConfig.loopGuard` 规则中断循环并返回错误提示

#### Scenario: 工具执行后上下文安全检查
- **WHEN** agentic loop 单轮工具执行完毕
- **THEN** 系统 SHALL 估算当前消息列表总 token 数，若超过 contextLimit × 0.85 执行 Session Pruning，若仍超 0.90 执行紧急 Compaction
