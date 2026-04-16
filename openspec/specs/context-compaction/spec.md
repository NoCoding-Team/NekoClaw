# context-compaction

上下文压缩与裁剪——防止 LLM 上下文窗口溢出的多层保护机制。

---

## Overview

通过 token 估算、工具输出截断、Session Pruning 和 LLM 摘要压缩四层机制，保护前后端 LLM Pipeline 在长对话中不超出上下文窗口限制。Mode A（服务端）和 Mode B（本地前端）采用相同策略。

---

## Requirements

### Token 估算

系统 SHALL 提供 `estimateTokens(text: string): number` 函数，返回文本的 token 数估算值。前端（TypeScript）和后端（Python）SHALL 各实现一份，使用相同算法。

#### Scenario: 中英混合文本估算
- **WHEN** 调用 `estimateTokens` 传入文本
- **THEN** 系统 SHALL 返回 `Math.ceil(text.length * 0.6)` 作为估算 token 数

#### Scenario: 空文本
- **WHEN** 调用 `estimateTokens` 传入空字符串
- **THEN** 系统 SHALL 返回 0

### 前端 Mode B Compaction

`useLocalLLM` SHALL 在发送消息前检测上下文是否接近模型上下文窗口上限，超过阈值时执行 Compaction。

#### Scenario: 上下文未超阈值
- **WHEN** 估算总 token 数 ≤ contextLimit × 0.70
- **THEN** 系统 SHALL 不触发 Compaction，正常发送所有消息

#### Scenario: 上下文超过阈值触发 Compaction
- **WHEN** 估算总 token 数 > contextLimit × 0.70 且消息数 > 10
- **THEN** 系统 SHALL 先执行 Memory Refresh（受最小轮次间隔保护约束，而非每会话仅一次限制），再执行 LLM 摘要压缩

#### Scenario: Compaction 摘要生成
- **WHEN** Compaction 触发
- **THEN** 系统 SHALL 保留最近 20 条消息原样，将更早的消息发给当前 LLM 生成对话摘要，用一条 `[对话历史摘要]\n{summary}` 消息替代被压缩的消息

#### Scenario: Compaction 摘要持久化
- **WHEN** Compaction 摘要生成成功
- **THEN** 系统 SHALL 将摘要存入 SQLite 作为一条 `role=system` 的消息记录，后续加载会话时直接使用摘要而非重新压缩

#### Scenario: Compaction 失败回退
- **WHEN** LLM 摘要生成失败（网络错误、模型拒绝等）
- **THEN** 系统 SHALL 使用固定文本 `（历史对话已压缩）` 作为摘要，仍然完成压缩流程

### 后端 Compaction 修复

后端 `_persist_message()` SHALL 正确设置 Message.token_count 字段，使已有的 Compaction 触发条件能正常工作。`_compress_history` 前的 Memory Refresh 调用 SHALL 使用轮次间隔保护替代 `_memory_refresh_done` set 的一次性限制。

#### Scenario: 消息持久化时设置 token_count
- **WHEN** 后端 `_persist_message()` 创建新的 Message 记录
- **THEN** Message.token_count SHALL 被设置为 `estimate_tokens(content)` 的返回值，而非默认值 0

#### Scenario: 后端 Compaction 正常触发
- **WHEN** 会话消息的 `sum(token_count)` 超过 `context_limit * 0.70` 且消息数 > 10
- **THEN** 后端 SHALL 先执行 `_memory_refresh()`（受最小轮次间隔保护约束），再执行 `_compress_history()`

#### Scenario: 后端多次 refresh
- **WHEN** 后端同一会话中多次达到 compaction 条件（例如 compaction 后继续长对话再次接近阈值）
- **THEN** 后端 SHALL 允许再次执行 `_memory_refresh()`，不因 `_memory_refresh_done` 而跳过

### Mid-loop 上下文安全检查

Agentic loop 中每执行完一个 tool_call 后，系统 SHALL 估算当前上下文大小并在接近上限时采取保护措施。

#### Scenario: Mid-loop 上下文 85% 阈值 Pruning
- **WHEN** agentic loop 工具执行后，估算总 token > contextLimit × 0.85
- **THEN** 系统 SHALL 对当前消息列表执行一次 Session Pruning

#### Scenario: Mid-loop 上下文 90% 阈值紧急压缩
- **WHEN** Session Pruning 后估算总 token 仍 > contextLimit × 0.90
- **THEN** 系统 SHALL 执行紧急 Compaction（不执行 Memory Refresh），保留最近 20 条消息并压缩其余

#### Scenario: Mid-loop 安全触发前端和后端一致
- **WHEN** Mode A 或 Mode B 的 agentic loop 中 tool_call 执行完毕
- **THEN** 系统 SHALL 使用相同的阈值和策略进行上下文安全检查

### 工具输出截断（LLM 上下文）

工具执行结果在追加到 LLM 消息列表时 SHALL 执行长度截断，与 UI 展示截断独立。

#### Scenario: 工具输出超过截断阈值
- **WHEN** tool_result 内容长度超过 MAX_TOOL_RESULT_CHARS（默认 8000 字符）
- **THEN** 系统 SHALL 将内容截断为 `首6000字符 + "\n...[输出过长已截断]...\n" + 尾1500字符` 后再追加到 LLM 消息列表

#### Scenario: 工具输出未超阈值
- **WHEN** tool_result 内容长度 ≤ MAX_TOOL_RESULT_CHARS
- **THEN** 系统 SHALL 保留完整内容追加到 LLM 消息列表

---

## Out of Scope

- 自动调整 contextLimit 上限（由用户在 Settings 中配置）
- 压缩质量评估（是否要保留的信息被压缩丢失）
