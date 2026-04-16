## MODIFIED Requirements

### Requirement: Agentic Loop

`useLocalLLM` 的 `sendMessage` SHALL 实现 agentic while-loop：调用 LLM → 若返回 tool_calls → 执行工具 → 追加结果到 messages → 再次调用 LLM，直到 LLM 返回纯文本响应或达到轮次上限。Agentic loop SHALL 在每轮工具执行后检查上下文大小，必要时触发 Session Pruning 或紧急 Compaction。

#### Scenario: 单轮无工具对话
- **WHEN** LLM 首轮返回纯文本（无 tool_calls）
- **THEN** agentic loop 在首轮结束，行为与当前实现一致

#### Scenario: 多轮工具调用
- **WHEN** LLM 返回 tool_calls（如 `memory_write`）
- **THEN** 系统 SHALL 执行工具、将 assistant message（含 tool_calls）和 tool result message 追加到 messages，再次调用 LLM 流式获取下一轮响应

#### Scenario: 轮次上限保护
- **WHEN** agentic loop 执行轮次达到 `MAX_TOOL_ROUNDS`（默认 10）
- **THEN** 系统 SHALL 终止循环并向用户显示警告消息

#### Scenario: 循环守卫
- **WHEN** agentic loop 中检测到 LLM 重复调用相同工具形成循环
- **THEN** 系统 SHALL 按 `securityConfig.loopGuard` 规则中断循环并返回错误提示

#### Scenario: 工具执行后上下文安全检查
- **WHEN** agentic loop 单轮工具执行完毕
- **THEN** 系统 SHALL 估算当前消息列表总 token 数，若超过 contextLimit × 0.85 执行 Session Pruning，若仍超 0.90 执行紧急 Compaction
