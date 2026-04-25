## 1. 依赖与数据库准备

- [x] 1.1 在 requirements.txt 中添加新依赖：llama-index-core、llama-index-vector-stores-postgres、llama-index-retrievers-bm25、llama-index-embeddings-openai、pgvector、jieba、tiktoken
- [x] 1.2 在 PostgreSQL 中执行 `CREATE EXTENSION IF NOT EXISTS vector`，创建 Alembic 迁移脚本
- [x] 1.3 在 llm_config 模型中添加 context_window 字段（Integer, nullable, default 128000），创建对应 Alembic 迁移

## 2. LlamaIndex 检索服务

- [x] 2.1 创建 `backend/app/services/memory_search.py`：初始化 PGVectorStore（从 DATABASE_URL 解析连接参数）、OpenAIEmbedding（从 settings 读取 embedding 配置）
- [x] 2.2 实现 `rebuild_memory_index(user_id, file_path)` 函数：读取指定记忆文件 → SentenceSplitter(chunk_size=256, chunk_overlap=64) 分块 → 写入 PGVectorStore + 更新 BM25 缓存
- [x] 2.3 实现 `search_memory(user_id, query, top_k)` 函数：BM25Retriever（jieba.cut_for_search 分词）+ VectorRetriever → 30/70 加权融合 → 返回 top_k 结果
- [x] 2.4 实现 BM25 节点缓存：`dict[str, list[TextNode]]` 进程内缓存，首次搜索 lazy load 从 PG，rebuild 时同步更新
- [x] 2.5 实现 embedding 不可用时的降级路径：无 EMBEDDING_BASE_URL 时仅使用 BM25Retriever

## 3. 工具层改造

- [x] 3.1 在 `definitions.py` 中将 `search_knowledge_base` 工具定义改名为 `search_memory`，更新 description 和参数说明
- [x] 3.2 在 `server_tools.py` 中实现 `execute_search_memory`：调用 memory_search.search_memory，替代 execute_search_knowledge_base
- [x] 3.3 修改 `execute_memory_write`：写入文件后调用 `rebuild_memory_index(user_id, file_path)` 替代旧的 SQLite rebuild
- [x] 3.4 修改 `execute_memory_search`：底层改用 memory_search.search_memory 替代手写的文件遍历搜索
- [x] 3.5 更新 `server_tools.py` 的工具路由：移除 search_knowledge_base 分支，新增 search_memory 分支

## 4. Agent 节点改造

- [x] 4.1 在 `nodes.py` 中删除 `_route_knowledge_search` 函数及其相关的 WebSocket check_local_index 逻辑
- [x] 4.2 修改 tools_node 中 search_memory 的路由：直接调用 execute_server_tool，不再走客户端路由
- [x] 4.3 在 `context.py` 的 `_load_memory` 中将 `search_memory_index` 调用替换为 `memory_search.search_memory`

## 5. 对话压缩

- [x] 5.1 创建 `backend/app/services/agent/compaction.py`：实现 `get_encoder(model_name)` 根据模型名选择 tiktoken 编码器（gpt-4o → o200k_base，其他 → cl100k_base）
- [x] 5.2 实现 `count_message_tokens(messages, encoder)` 计算消息列表的总 token 数
- [x] 5.3 实现 `should_compress(messages, context_window, system_prompt_tokens)` 判断是否超过 50% 阈值
- [x] 5.4 实现 `compress_messages(messages, llm_config)` 压缩流程：先 memory_refresh → 对前 50% 消息 LLM 总结 → 返回压缩后的消息列表
- [x] 5.5 在 `nodes.py` 的 prepare 或 llm_call 节点中集成压缩检查：每次调用前检查并在需要时执行压缩

## 6. Daily Note Cron

- [x] 6.1 创建 `backend/app/services/daily_note.py`：实现 `generate_daily_note(user_id, date)` 查询当天消息 → LLM 总结 → 写入 {date}.md → 触发索引重建
- [x] 6.2 实现 `daily_note_cron()` asyncio 定时循环：计算到 23:50 的 sleep 时间 → 执行 → 循环
- [x] 6.3 在 `startup.py` 的 lifespan 中注册 daily_note_cron task，shutdown 时 cancel
- [x] 6.4 在 startup.py 中添加 `jieba.initialize()` 预加载

## 7. 知识库代码清理

- [x] 7.1 删除 `backend/app/services/knowledge.py`
- [x] 7.2 删除 `backend/app/api/knowledge.py`，从 `api/router.py` 中移除 knowledge 路由
- [x] 7.3 删除 `backend/app/services/memory_index.py`（旧 SQLite 实现，已被 memory_search.py 替代）
- [x] 7.4 清理 desktop 端 knowledge 相关代码：移除 check_local_index WebSocket 响应逻辑、knowledge IPC handler
- [x] 7.5 清理 `server_tools.py` 中 search_knowledge_base 的残留引用

## 8. 前端适配

- [x] 8.1 desktop 端移除 useWebSocket 中的 check_local_index 事件处理
- [x] 8.2 Settings 面板中如有知识库相关配置 UI，移除
- [x] 8.3 工具白名单中将 search_knowledge_base 替换为 search_memory

## 9. 验证与迁移

- [x] 9.1 编写一次性迁移脚本：读取现有 SQLite memory_index.db → 写入 PG memory_vectors 表
- [x] 9.2 验证 search_memory 工具端到端：LLM 调用 → 混合检索 → 返回结果
- [x] 9.3 验证对话压缩：长对话超阈值时自动触发总结压缩
- [x] 9.4 验证 daily_note_cron：手动触发测试生成 daily note
- [x] 9.5 验证 memory_write → 索引重建 → search_memory 可搜到新内容
