# hybrid-search-llamaindex

LlamaIndex 混合检索——使用 PGVectorStore + BM25Retriever 实现 30/70 加权融合的向量+关键词混合搜索，替代原有本地 SQLite 知识库检索。

---

## Overview

使用 LlamaIndex 管理记忆文件的向量索引，存储于 PostgreSQL（pgvector 扩展）。BM25 使用 jieba 中文分词，向量检索使用 PGVectorStore。两路结果经归一化加权融合后返回 top-k 结果。

---

## Requirements

### Requirement: LlamaIndex PGVectorStore 初始化
系统 SHALL 使用 LlamaIndex PGVectorStore 连接 PostgreSQL（pgvector 扩展），作为记忆向量的存储后端。

#### Scenario: 应用启动时初始化 VectorStore
- **WHEN** FastAPI 应用启动
- **THEN** 系统 SHALL 创建 PGVectorStore 实例，连接参数从 DATABASE_URL 解析，表名为 `memory_vectors`，embedding 维度从 EMBEDDING_MODEL 推断

#### Scenario: pgvector 扩展不可用
- **WHEN** PostgreSQL 未安装 pgvector 扩展
- **THEN** 系统 SHALL 记录警告日志并降级为纯 BM25 检索模式，search_memory 工具仍可用

### Requirement: BM25 中文分词检索
系统 SHALL 使用 LlamaIndex BM25Retriever 配合 jieba.cut_for_search 分词器执行关键词检索。

#### Scenario: 中文查询分词
- **WHEN** search_memory 收到中文查询 "上次讨论的数据库方案"
- **THEN** BM25Retriever SHALL 使用 jieba.cut_for_search 将查询切分后进行匹配

#### Scenario: 英文查询兼容
- **WHEN** search_memory 收到英文或中英混合查询
- **THEN** jieba.cut_for_search SHALL 正确处理英文单词（保持完整）和中文（细粒度分词）

### Requirement: 混合检索加权融合
系统 SHALL 对 BM25 和向量检索结果执行 30/70 加权融合，返回综合排序的 top-k 结果。

#### Scenario: 双路检索均有结果
- **WHEN** BM25 和向量检索均返回候选结果
- **THEN** 系统 SHALL 对两路分数分别归一化后，按 0.3 * bm25_score + 0.7 * vector_score 加权合并，去重后返回 top_k 个结果

#### Scenario: 仅 BM25 有结果（无 embedding 配置）
- **WHEN** 服务端未配置 embedding model（EMBEDDING_BASE_URL 为空）
- **THEN** 系统 SHALL 仅使用 BM25 检索结果，不执行向量检索

#### Scenario: 仅向量检索有结果
- **WHEN** BM25 未匹配任何关键词但向量检索有语义匹配
- **THEN** 系统 SHALL 返回纯向量检索结果

#### Scenario: 双路均无结果
- **WHEN** BM25 和向量检索均无匹配
- **THEN** 系统 SHALL 返回空列表

### Requirement: search_memory 工具定义
系统 SHALL 提供 `search_memory` 工具替代 `search_knowledge_base`，供 LLM 主动搜索情景记忆。

#### Scenario: 工具调用
- **WHEN** LLM 调用 search_memory 工具，参数为 query（必填）和 top_k（可选，默认 5）
- **THEN** 系统 SHALL 在服务端执行混合检索，搜索范围为当前用户的 MEMORY.md 和所有 daily notes，返回 top_k 个相关片段

#### Scenario: 直接服务端执行
- **WHEN** LLM 调用 search_memory
- **THEN** 系统 SHALL 直接在服务端执行检索，不经过客户端路由

### Requirement: BM25 节点缓存
系统 SHALL 在进程内维护 per-user 的 TextNode 缓存，供 BM25Retriever 使用。

#### Scenario: 首次搜索加载缓存
- **WHEN** 某用户首次调用 search_memory 且进程内无缓存
- **THEN** 系统 SHALL 从 PostgreSQL memory_vectors 表加载该用户的所有 chunks 构建 TextNode 列表并缓存
