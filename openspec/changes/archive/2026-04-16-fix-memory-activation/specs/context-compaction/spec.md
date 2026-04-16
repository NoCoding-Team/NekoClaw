## MODIFIED Requirements

### Requirement: 前端 Mode B Compaction
`useLocalLLM` SHALL 在 Compaction 触发时允许多次 Memory Refresh，使用轮次间隔保护替代一次性限制。

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

### Requirement: 后端 Compaction 修复
后端 `_compress_history` 前的 Memory Refresh 调用 SHALL 使用轮次间隔保护替代 `_memory_refresh_done` set 的一次性限制。

#### Scenario: 后端 Compaction 正常触发
- **WHEN** 会话消息的 `sum(token_count)` 超过 `context_limit * 0.70` 且消息数 > 10
- **THEN** 后端 SHALL 先执行 `_memory_refresh()`（受最小轮次间隔保护约束），再执行 `_compress_history()`

#### Scenario: 后端多次 refresh
- **WHEN** 后端同一会话中多次达到 compaction 条件（例如 compaction 后继续长对话再次接近阈值）
- **THEN** 后端 SHALL 允许再次执行 `_memory_refresh()`，不因 `_memory_refresh_done` 而跳过
