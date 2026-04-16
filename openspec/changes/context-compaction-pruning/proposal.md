## Why

长对话场景下，发给 LLM 的上下文窗口无限增长，导致 token 超限报错或浪费大量 token/算力。后端 Mode A 的压缩代码已存在但因 `token_count` 始终为 0 的 Bug 从未触发；前端 Mode B（本地直连）完全没有任何压缩或裁剪机制。工具输出（shell_exec、file_read、browser 截图等）在发给 LLM 时保留完整内容，几轮工具调用就可能累积几十 KB，尤其对本地小模型（8K-32K context）影响严重。

## What Changes

- 修复后端 `_persist_message()` 不设置 `token_count` 的 Bug，使已有 Compaction + Memory Refresh 逻辑能正常触发
- 新增 Session Pruning（会话剪枝）：构建上下文窗口时裁剪旧轮次的 tool_result，仅影响发给 LLM 的内容，不修改持久化存储
- 前端 Mode B 新增 Compaction 机制：基于本地 LLM 生成摘要替代早期对话，包含 token 估算、Memory Refresh 前置步骤
- 前端工具输出在发给 LLM 时增加长度截断（与 UI 展示截断独立）
- Agentic loop 增加 mid-loop 上下文安全检查，单轮工具调用后检测是否接近上下文上限

## Capabilities

### New Capabilities
- `session-pruning`: 构建 LLM 上下文时裁剪旧工具输出——保留最近 N 轮原样，更早的软裁剪或硬清空，仅内存中操作不改磁盘
- `context-compaction`: 前端 Mode B 的 LLM 摘要式上下文压缩——token 估算、Memory Refresh、摘要生成、摘要持久化、mid-loop 安全检查

### Modified Capabilities
- `active-memory`: Memory Refresh 扩展到前端 Mode B，压缩前自动触发 memory_write 保存重要信息
- `local-streaming-tool-calls`: Agentic loop 增加 mid-loop 上下文大小检查和工具输出截断

## Impact

- **后端** `backend/app/services/llm.py`：修复 `_persist_message()` token_count、Session Pruning 逻辑、mid-loop 安全
- **前端** `desktop/src/hooks/useLocalLLM.ts`：新增 Compaction + Memory Refresh + Session Pruning + 工具输出截断 + token 估算
- **前端** `desktop/src/hooks/localTools.ts`：工具结果返回时截断长内容
- **数据模型**：SQLite 可能新增 compaction_summary 字段或表，用于持久化摘要
- **用户可感知**：长对话不再突然报错；压缩发生时可选 UI 提示
