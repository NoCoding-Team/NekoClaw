## Context

当前 `prepare()` 节点在每次用户发消息时构造 `query_hint` 用于记忆 RAG 检索：

```python
query_hint = session.title + " " + last_user_msg[:200]
```

存在三个问题：
1. 首轮对话 title 为"新对话"，引入噪声
2. 只取最后一条用户消息，多轮对话上下文丢失
3. `memory_refresh()` 调用 `_load_memory()` 时不传 query_hint，大文件走硬截断

另外 `search_memory` 和 `memory_search` 两个工具功能几乎完全重复（底层同一函数，仅 top_k 不同）。

## Goals / Non-Goals

**Goals:**
- 提升长对话场景下记忆 RAG 检索的相关性
- 复用已有 compaction summary，零额外 LLM 调用
- 合并重复的搜索工具，简化工具集
- 让 memory_refresh 在大记忆场景也能精准检索

**Non-Goals:**
- 不改变 RAG 检索引擎本身（BM25 + Milvus 权重、chunk 策略等）
- 不改变 compaction 触发逻辑或摘要生成方式
- 不改变 MEMORY.md 的 4000 字符阈值
- 不增加新的 LLM 调用

## Decisions

### Decision 1: query_hint 多源拼接策略

**选择**：`title（过滤"新对话"）+ compaction summary[:200] + 最近 3 条 user 消息各 150 字符`，总长 cap 500 字符。

**替代方案**：
- 滑动窗口摘要（每 K 轮 LLM 生成）：效果更好但有额外 token 成本，pass
- Session keywords 提取：需额外 LLM 调用，pass
- 仅扩展为最近 N 条消息：无法覆盖被 compaction 删除的历史，不够

**理由**：compaction summary 恰好在最需要的场景（长对话、大量历史被压缩）下存在，且已经计算好，零成本复用。短对话无摘要时，最近 3 条消息已足够覆盖话题切换。

### Decision 2: Compaction summary 提取方式

**选择**：在 `prepare()` 中从 history 反向遍历，匹配 `role="system"` 且 `content.startswith("[对话历史摘要]")`。

**理由**：摘要持久存储在 DB 中（`deleted_at = NULL`），加载 history 时已包含，无需额外查询。

### Decision 3: 合并 search_memory 和 memory_search

**选择**：保留 `search_memory` 名称，删除 `memory_search`，统一 top_k 为 5（工具参数支持调用方自定义）。

**理由**：两个工具底层调用同一函数，功能完全重复，对 agent 造成不必要的选择困难。保留 `search_memory` 因为它语义更清晰（动词+宾语）。

### Decision 4: memory_refresh 传入 query_hint

**选择**：在 `memory_refresh()` 签名增加 `query_hint` 参数，传递给 `_load_memory()`。`compress_messages()` 调用 `memory_refresh()` 时，从 history 构造 query_hint 传入。

**理由**：当前 memory_refresh 在 MEMORY.md > 4000 字符时只能看到前 4000 字符的截断，如果用户新偏好写在文件尾部（通常是 append），refresh LLM 看不到最近的记忆条目。

## Risks / Trade-offs

- **[摘要质量]** compaction summary 如果太笼统（如"用户讨论了多个话题"），拿来做搜索词效果有限 → 缓解：summary 只是 query_hint 的一部分，还有最近 3 条消息兜底
- **[500 字符截断]** 摘要 + 3 条消息 + title 可能超 500 字符 → 缓解：作为搜索 query 500 字符已足够长，BM25 和向量检索不需要更长的 query
- **[工具合并兼容性]** 如果已有对话历史中 agent 曾调用 `memory_search`，旧 session 回放时可能找不到工具 → 缓解：agent 调用的是工具名字符串，旧消息只是存储不会重新执行
