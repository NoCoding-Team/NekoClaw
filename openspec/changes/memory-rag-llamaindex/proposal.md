## Why

当前记忆检索系统基于手写 SQLite FTS5 + cosine similarity 实现，知识库检索还包含 Electron 客户端本地优先路由逻辑。存在以下问题：

1. **不再需要知识库**——知识库（knowledge.db、本地索引、上传文件流程）功能冗余，需要清除
2. **SQLite 与主数据库割裂**——主业务使用 PostgreSQL，记忆索引却用独立 SQLite 文件，运维复杂
3. **手写 RAG 维护成本高**——分块、embedding、BM25、混合排序全部手写，代码分散在 knowledge.py、memory_index.py、server_tools.py
4. **缺乏对话压缩**——无 token 精确计数，无法在对话超限时智能压缩
5. **缺乏每日自动汇总**——daily notes 依赖 LLM 手动写入，无定时生成机制

引入 LlamaIndex 框架统一检索层，将存储迁移到 PostgreSQL (pgvector)，并补齐对话压缩和每日汇总能力。

## What Changes

- **替换检索引擎**：用 LlamaIndex (PGVectorStore + BM25Retriever) 替代手写 SQLite FTS5 + cosine similarity
- **存储迁移**：memory_index.db (SQLite) → PostgreSQL memory_chunks 表 (pgvector 扩展)
- **工具重命名**：`search_knowledge_base` → `search_memory`，只搜索情景记忆（MEMORY.md + daily notes）
- **删除知识库**：移除 knowledge.py、api/knowledge.py、knowledge.db、客户端本地索引路由 `_route_knowledge_search`
- **对话压缩**：引入 tiktoken 精确计数，对话超过 context_window 50% 时对前半历史做 LLM 总结替换
- **每日汇总 Cron**：backend 内置定时任务，每日 23:50 自动汇总当天对话生成 {date}.md
- **中文分词**：BM25 检索使用 jieba 分词器，替代默认空格切词
- **新增依赖**：llama-index-core、llama-index-vector-stores-postgres、llama-index-retrievers-bm25、llama-index-embeddings-openai、pgvector、jieba、tiktoken

## Capabilities

### New Capabilities
- `hybrid-search-llamaindex`: LlamaIndex 驱动的混合检索服务（PGVectorStore 向量检索 70% + BM25 关键词检索 30%，jieba 中文分词）
- `conversation-compression`: tiktoken 精确 token 计数 + 对话超阈值自动压缩（前 50% 消息 LLM 总结替换）
- `daily-note-cron`: backend 内置 cron，每日定时汇总当天所有会话生成 daily note 并触发索引重建

### Modified Capabilities
- `memory-rag-injection`: 检索后端从 SQLite memory_index.db 迁移到 PostgreSQL + LlamaIndex，索引重建流程变更
- `knowledge-retrieval`: **BREAKING** 整体移除，search_knowledge_base 工具删除，替换为 search_memory
- `active-memory`: memory_search 工具底层改用 LlamaIndex 混合检索，memory_write 触发 LlamaIndex 索引增量更新

## Impact

- **后端代码**：services/knowledge.py（删除）、services/memory_index.py（重写为 LlamaIndex）、services/tools/server_tools.py（search_knowledge_base → search_memory）、services/tools/definitions.py（工具定义更新）、services/agent/nodes.py（删除 _route_knowledge_search）、services/agent/context.py（压缩逻辑）、startup.py（cron 注册）
- **前端代码**：desktop 端移除 knowledge 相关 IPC handler 和 check_local_index 响应逻辑
- **API 路由**：api/knowledge.py 删除，api/router.py 移除 knowledge 路由
- **数据库**：PostgreSQL 需启用 pgvector 扩展 (`CREATE EXTENSION vector`)，新增 Alembic 迁移
- **依赖**：requirements.txt 新增 7 个包
- **Docker**：无新服务，但 PostgreSQL 需要 pgvector 扩展
