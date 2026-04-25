## Context

NekoClaw 是一个 AI 猫咪助理，后端 FastAPI + LangGraph，前端 Electron + React。当前记忆系统使用文件系统存储 Markdown 记忆文件（SOUL.md、MEMORY.md 等），检索通过手写 SQLite FTS5 + cosine similarity 实现（memory_index.db）。知识库系统（knowledge.db）提供文档上传和检索功能，但已确认不再需要。

主业务数据库为 PostgreSQL（外部宿主机，通过 asyncpg 连接）。SQLite 索引文件运行在 Docker 容器内，与主数据库架构割裂。

记忆分层现状：
- 人格记忆（SOUL.md / IDENTITY.md / USER.md / AGENTS.md）：每次全量注入 system prompt
- 情景记忆（MEMORY.md + daily notes）：小文件全量注入，大文件 RAG 检索注入
- 程序性记忆（SKILLS_SNAPSHOT.md）：全量注入

缺失能力：精确 token 计数、对话自动压缩、每日自动汇总。

## Goals / Non-Goals

**Goals:**
- 用 LlamaIndex 框架统一检索层，替代手写 RAG 代码
- 将记忆索引存储从 SQLite 迁移到 PostgreSQL（pgvector + tsvector）
- 暴露 `search_memory` 工具供 LLM 主动搜索情景记忆
- 引入 tiktoken 精确 token 计数，支持对话超限自动压缩
- 新增 backend 内置 cron 每日自动汇总对话生成 daily note
- 彻底移除知识库相关代码和 API

**Non-Goals:**
- 不重新设计人格记忆（SOUL/IDENTITY/USER）的注入方式——保持全量注入
- 不引入 Redis 热缓存层——个人助理场景暂不需要
- 不支持多租户高并发——当前为单用户桌面应用
- 不引入 Re-ranking 模型——混合检索加权已满足需求
- 不改动 memory_write / memory_read 工具的接口——只改底层实现

## Decisions

### D1: 检索框架选型 — LlamaIndex

**选择**: LlamaIndex (llama-index-core + 插件生态)

**理由**:
- PGVectorStore 插件直接对接 PostgreSQL + pgvector，无需手写向量存储
- BM25Retriever 插件支持自定义 tokenizer（jieba），解决中文分词
- SentenceSplitter 内置分块逻辑，替代手写 chunking
- Embedding 层抽象支持任意 OpenAI 兼容接口

**备选方案**:
- 手写 RAG（当前方案）：维护成本高，已在 knowledge.py、memory_index.py 中各写一套
- LangChain Retrievers：与 LangGraph agent 更近，但检索插件生态不如 LlamaIndex 丰富
- Haystack：功能全面但过重，不适合嵌入现有架构

### D2: BM25 中文分词 — jieba + cut_for_search

**选择**: `jieba.cut_for_search` 作为 BM25Retriever 的 tokenizer

**理由**:
- LlamaIndex BM25Retriever 底层用 rank-bm25 库，默认按空格切词，对中文无效
- `cut_for_search` 在精确分词基础上做细粒度切分，搜索召回率更高
- 无需安装 PostgreSQL 扩展（zhparser/pg_jieba），Python 侧完成分词

**实现**:
```python
BM25Retriever.from_defaults(
    nodes=nodes,
    similarity_top_k=top_k * 3,
    tokenizer=lambda text: list(jieba.cut_for_search(text)),
)
```

### D3: 混合检索权重 — 30% BM25 + 70% Vector

**选择**: 向量语义 70% + BM25 关键词 30%

**理由**:
- 记忆内容以自然语言描述为主（"用户喜欢深色主题"），语义匹配更重要
- BM25 保留用于精准匹配专有名词、项目名、API 名称等
- 与现有 memory_index.py 的权重一致，行为无变化

### D4: BM25 节点存储 — 进程内缓存

**选择**: `dict[user_id, list[TextNode]]` 进程内缓存

**理由**:
- 个人助理场景，用户量极少，记忆文件体积有限（几百个 node）
- 内存占用可忽略，搜索零延迟
- rebuild 时同步更新缓存，进程重启后从 PG 重载

**备选**: 每次搜索从 PG 加载并临时构建 BM25 索引——多 ~50ms 延迟，不必要

### D5: token 计数 — tiktoken cl100k_base 通用估算

**选择**: 统一使用 `cl100k_base` 编码估算 token 数

**理由**:
- 对 GPT 系列精确，对 Claude/Gemini 误差 5-20%
- 用途是判断"要不要压缩"，不需要 billing 级精度
- 根据模型名选择编码器（gpt-4o → o200k_base，其他 → cl100k_base fallback）

### D6: 对话压缩策略 — 50% 阈值 + LLM 总结

**选择**: 对话 token 数超过 context_window 50% 时，对前半消息做 LLM 总结替换

**流程**:
1. 每次 LLM 调用前，tiktoken 计算所有消息 token 数
2. 超过 `llm_config.context_window * 0.5` 时触发
3. 先执行 memory_refresh 保存关键信息到 MEMORY.md
4. 对前 50% 消息调用 LLM 生成摘要
5. 替换前 50% 消息为一条 SystemMessage（摘要）
6. 压缩后对话 ≈ 摘要(~2000) + 后半原文

### D7: Daily Note Cron — asyncio 定时循环

**选择**: 在 `startup.py` 的 lifespan 中启动 asyncio 定时任务

**理由**:
- 不依赖外部调度器（crontab、celery）
- 与现有 FastAPI 应用生命周期绑定
- 每日 23:50 触发，遍历当天有消息的用户，LLM 总结生成 {date}.md

**备选**: scheduled_tasks 系统——那是用户配置的定时任务，日志汇总是系统行为，不应暴露给用户

### D8: 索引重建触发点

**触发条件**:
- `memory_write` 写入 MEMORY.md 或 daily note 后
- daily_note_cron 生成新文件后
- 用户在 MemoryPanel 页面编辑保存后（PUT /api/memory/files/）

**策略**: 文件级增量重建——只删除该文件的旧 chunks，重新分块 + embedding + 写入 PG

## Risks / Trade-offs

**[pgvector 扩展安装]** → 用户的外部 PostgreSQL 需要手动安装 pgvector 扩展。提供 Alembic 迁移脚本中自动执行 `CREATE EXTENSION IF NOT EXISTS vector`，并在启动时检查扩展是否可用，不可用时降级为纯 BM25 检索。

**[LlamaIndex 版本锁定]** → LlamaIndex 迭代快，API 可能变动。锁定 `llama-index-core>=0.11,<0.12` 大版本，关键接口做薄封装层隔离。

**[BM25 内存缓存失效]** → 进程重启后缓存丢失。在首次搜索时 lazy load 从 PG 重载 nodes，无需启动时全量加载所有用户。

**[jieba 首次加载慢]** → jieba 首次 import 加载词典约 1-2 秒。在 startup.py 中预加载 `jieba.initialize()`。

**[tiktoken 编码不精确]** → 对 Claude/Gemini 有 5-20% 误差。压缩阈值 50% 留有充足余量，误差不影响正确性。

**[数据迁移]** → 现有 memory_index.db 中的 chunks 需迁移到 PG。提供一次性迁移脚本读取 SQLite → 写入 PG memory_chunks 表。迁移后可安全删除 .db 文件。

## Migration Plan

1. PostgreSQL 安装 pgvector 扩展
2. Alembic 迁移：创建 memory_chunks 表（含 VECTOR 列和 GIN 索引）
3. 部署新代码（LlamaIndex 检索层 + search_memory 工具）
4. 运行迁移脚本：SQLite memory_index.db → PG memory_chunks
5. 验证 search_memory 工具可正常返回结果
6. 删除 knowledge.py、api/knowledge.py、memory_index.py（旧实现）
7. 清理 SQLite 文件（knowledge.db、memory_index.db）

**回滚**: 保留旧 SQLite 文件 7 天不删除，如需回滚可恢复旧代码指向 SQLite。

## Open Questions

- daily_note_cron 的执行时间 23:50 是否合适？是否需要可配置？
- MEMORY.md 的 RAG 阈值从 4000 字符改为基于 token 计数是否更准确？
- 是否需要为 embedding 不可用时提供纯 BM25 降级路径（当前已支持）？
