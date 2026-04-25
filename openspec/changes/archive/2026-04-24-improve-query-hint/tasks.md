## 1. 改进 query_hint 构造

- [x] 1.1 修改 `prepare()` 中 query_hint 构造逻辑：过滤"新对话" title、提取 compaction summary、取最近 3 条 user 消息、cap 500 字符
- [x] 1.2 提取辅助函数 `_build_query_hint(session, history)` 保持 prepare 节点清晰

## 2. memory_refresh 支持 RAG

- [x] 2.1 `memory_refresh()` 签名增加 `query_hint: str = ""` 参数，传递给 `_load_memory()`
- [x] 2.2 `compress_messages()` 调用 `memory_refresh()` 时从 history 构造 query_hint 传入

## 3. 合并重复搜索工具

- [x] 3.1 从 `definitions.py` 移除 `memory_search` 工具定义
- [x] 3.2 从 `server_tools.py` 移除 `execute_memory_search` 函数及其分发入口
- [x] 3.3 确认 `search_memory` 工具的 top_k 默认值为 5，支持参数自定义
