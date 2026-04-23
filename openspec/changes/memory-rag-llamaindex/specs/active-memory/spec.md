## MODIFIED Requirements

### Requirement: Tools
系统 SHALL 提供 `memory_write`、`memory_read`、`memory_search` 三个工具，全部在服务端执行。`memory_search` 底层改用 LlamaIndex 混合检索。

- `memory_write(path, content)`：将 content 写入 `{userData}/memory/{path}`。写入后 SHALL 触发 LlamaIndex 索引增量重建（针对该文件的 chunks）。
- `memory_read(path)`：读取 `{userData}/memory/{path}` 文件内容。path 为 `"."` 时返回目录列表。
- `memory_search(query)`：对所有记忆文件执行 LlamaIndex 混合检索（BM25 30% + 向量 70%），返回 top-K 相关片段。

#### Scenario: memory_write 触发索引重建
- **WHEN** LLM 调用 `memory_write` 写入 MEMORY.md 或 daily note
- **THEN** 系统 SHALL 在写入文件后异步触发 LlamaIndex 索引增量重建（删除该文件旧 chunks → 重新分块 → embedding → 写入 PG）

#### Scenario: memory_search 混合检索
- **WHEN** LLM 调用 `memory_search` 工具，query 为自然语言描述
- **THEN** 系统 SHALL 使用 LlamaIndex BM25Retriever（jieba 分词）+ VectorRetriever（PGVectorStore）执行混合检索，返回 30/70 加权融合后的 top-K 结果

#### Scenario: memory_search 无 embedding 降级
- **WHEN** LLM 调用 `memory_search` 但服务端未配置 embedding model
- **THEN** 系统 SHALL 仅使用 BM25Retriever 执行关键词检索
