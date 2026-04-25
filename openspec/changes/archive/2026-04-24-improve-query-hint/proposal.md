## Why

当 MEMORY.md 超过 4000 字符触发 RAG 检索时，`query_hint` 的构造过于简单（仅 session title + 最后一条用户消息），导致多轮对话中上下文丢失，检索到的记忆片段与实际对话主题不匹配。尤其在长对话触发 compaction 后，早期话题完全消失于 query_hint 中。

## What Changes

- **改进 query_hint 构造逻辑**：从"title + 最后 1 条消息"扩展为"title + compaction 摘要 + 最近 3 条用户消息"，复用已有的 compaction summary，零额外 LLM 调用
- **过滤无意义 title**：首轮对话 title 为"新对话"，应排除以避免引入噪声
- **合并重复搜索工具**：将 `search_memory` 和 `memory_search` 合并为一个工具，消除功能重复
- **memory_refresh 传入 query_hint**：使记忆整理在大 MEMORY.md 场景下也能使用 RAG 检索，而非硬截断

## Capabilities

### New Capabilities

### Modified Capabilities
- `memory-rag-injection`: query_hint 构造规则变更，从单消息扩展为多源拼接；新增首轮 title 过滤

## Impact

- `backend/app/services/agent/nodes.py` — `prepare()` 中 query_hint 构造逻辑
- `backend/app/services/agent/context.py` — `memory_refresh()` 增加 query_hint 参数
- `backend/app/services/tools/definitions.py` — 合并重复的搜索工具定义
- `backend/app/services/tools/server_tools.py` — 合并重复的搜索工具执行函数
