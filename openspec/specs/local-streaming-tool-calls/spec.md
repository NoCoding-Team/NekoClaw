# local-streaming-tool-calls

Mode B（本地 LLM）流式 SSE 解析 tool calls 并实现 agentic 工具调用循环能力。

---

## Overview

`useLocalLLM` 的流式响应处理支持解析 OpenAI 和 Anthropic 格式的 tool_calls，并实现 agentic while-loop：LLM 调用工具 → 执行 → 将结果追加到上下文 → 再次调用 LLM，直到 LLM 返回纯文本响应。

---

## Requirements

### OpenAI 格式 tool_calls delta 解析

`streamOpenAI` 函数 SHALL 解析 SSE 中的 `delta.tool_calls` 数组，累积拼接每个 tool call 的 `id`、`function.name` 和 `function.arguments` 片段，随文本内容一同返回结构化 `StreamResult`。

#### Scenario: 纯文本响应
- **WHEN** LLM 返回仅包含 `delta.content` 的 SSE 流
- **THEN** `streamOpenAI` SHALL 返回 `StreamResult` 其中 `toolCalls` 为 null，`content` 为完整文本

#### Scenario: tool call 分片累积
- **WHEN** LLM 返回多个 SSE chunk，其中 `delta.tool_calls[0].function.arguments` 分片到达
- **THEN** 系统 SHALL 按 `index` 累积拼接所有 `arguments` 片段，最终返回完整 JSON 字符串

#### Scenario: 混合文本与 tool call
- **WHEN** LLM 先输出部分文本再输出 tool call
- **THEN** `StreamResult.content` SHALL 包含文本部分，`StreamResult.toolCalls` SHALL 包含解析完成的工具调用

### Anthropic 格式 tool_use block 解析

`streamAnthropic` 函数 SHALL 解析 SSE 中的 `content_block_start`（type=tool_use）和 `input_json_delta` 事件，累积拼接工具调用参数。

#### Scenario: Anthropic tool_use 解析
- **WHEN** Anthropic API 返回 `content_block_start` with `type: "tool_use"` 后跟 `input_json_delta` 事件
- **THEN** 系统 SHALL 收集 block id、tool name，累积 `partial_json` 片段，在 `content_block_stop` 时完成解析

#### Scenario: Anthropic 纯文本响应
- **WHEN** Anthropic API 仅返回 `text_delta` 类型的 content block
- **THEN** `StreamResult.toolCalls` SHALL 为 null

### Agentic Loop

`useLocalLLM` 的 `sendMessage` SHALL 实现 agentic while-loop：调用 LLM → 若返回 tool_calls → 执行工具 → 追加结果到 messages → 再次调用 LLM，直到 LLM 返回纯文本响应或达到轮次上限。

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

### 前端工具定义

系统 SHALL 在前端维护 LLM function calling 工具定义列表，传入 LLM API 的 `tools` 参数。

#### Scenario: 工具定义传递
- **WHEN** Mode B 下 `sendMessage` 构建 LLM API 请求
- **THEN** 请求体 SHALL 包含 `tools` 数组，格式符合 OpenAI function calling schema

#### Scenario: Memory 工具始终包含
- **WHEN** 获取工具定义列表
- **THEN** `memory_write`、`memory_read`、`memory_search` 工具 SHALL 始终包含在列表中，不可被用户禁用
