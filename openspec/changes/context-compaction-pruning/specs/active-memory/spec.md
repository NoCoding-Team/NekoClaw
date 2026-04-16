## MODIFIED Requirements

### Requirement: Memory Refresh (Pre-Compaction)

`_memory_refresh` SHALL 使用 `memory_write` 工具替代 `save_memory`，引导 LLM 将重要信息写入 Markdown 文件。Memory Refresh SHALL 同时在后端 Mode A 和前端 Mode B 中实现。

#### Scenario: Compaction 前记忆刷新
- **WHEN** `total_tokens > context_limit * COMPRESS_RATIO` 触发 compaction
- **THEN** 系统 SHALL 先执行 `_memory_refresh`，静默请求 LLM 调用 `memory_write` 保存重要信息

#### Scenario: Mode B 前端 Memory Refresh
- **WHEN** 前端 Mode B 检测到上下文超过 70% 阈值即将触发 Compaction
- **THEN** 系统 SHALL 执行一轮静默 LLM 调用，提示词引导 LLM 检查最近对话并用 `memory_write` 工具将重要信息保存到 MEMORY.md 或每日笔记

#### Scenario: Memory Refresh 每会话限一次
- **WHEN** 当前会话已经执行过一次 Memory Refresh
- **THEN** 系统 SHALL 跳过后续的 Memory Refresh 请求，不重复执行

#### Scenario: Memory Refresh 静默执行
- **WHEN** Memory Refresh 执行过程中
- **THEN** 系统 SHALL NOT 向用户 UI 发送可见消息，不在聊天气泡中显示 Memory Refresh 的中间过程
