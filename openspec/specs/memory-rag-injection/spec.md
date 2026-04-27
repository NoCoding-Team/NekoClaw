### Requirement: MEMORY.md 超限 RAG 检索
`_load_memory` SHALL 在 MEMORY.md 内容超过 4000 字符时，使用 RAG 混合检索替代全文注入。

#### Scenario: 小记忆全文注入
- **WHEN** MEMORY.md 文件内容 ≤ 4000 字符
- **THEN** 系统 SHALL 将全文注入 system prompt（当前行为不变）

#### Scenario: 大记忆 RAG 检索注入
- **WHEN** MEMORY.md 文件内容 > 4000 字符
- **THEN** 系统 SHALL 使用 query_hint 对 LlamaIndex 混合检索执行搜索，返回 top-K 相关片段拼接后注入 system prompt，总量不超过 4000 字符

#### Scenario: query_hint 多源构造
- **WHEN** `prepare()` 构造 query_hint
- **THEN** query_hint SHALL 按以下优先级拼接：
  1. Session.title（排除值为"新对话"的情况）
  2. 最近一条 compaction summary 的前 200 字符（如果 history 中存在 `role="system"` 且 content 以 `[对话历史摘要]` 开头的消息）
  3. 最近 3 条用户消息，每条取前 150 字符
- **AND** 总长度 SHALL 不超过 500 字符

#### Scenario: 首轮对话 title 过滤
- **WHEN** Session.title 为"新对话"
- **THEN** query_hint 构造 SHALL 跳过 title 部分，仅使用用户消息

#### Scenario: 无 compaction summary 时降级
- **WHEN** history 中不存在 compaction summary 消息
- **THEN** query_hint SHALL 仅由 title + 最近 3 条用户消息构成（跳过 summary 部分）

#### Scenario: 无 query_hint 时回退
- **WHEN** query_hint 为空字符串（如首次对话无标题且无消息）
- **THEN** 系统 SHALL 回退到暴力截断前 4000 字符的行为

### Requirement: 记忆独立索引
系统 SHALL 为每个用户的记忆文件在 PostgreSQL 中建立索引，使用 LlamaIndex PGVectorStore 管理。

#### Scenario: 索引存储位置
- **WHEN** 系统创建记忆索引
- **THEN** 索引 SHALL 存储于 PostgreSQL memory_vectors 表中，按 user_id 字段隔离，不再使用 SQLite memory_index.db

#### Scenario: 索引内容范围扩大
- **WHEN** 系统构建记忆索引
- **THEN** 索引 SHALL 包含 MEMORY.md 和所有 daily notes（{date}.md）的分块内容

#### Scenario: embedding 可选
- **WHEN** 服务端配置了 embedding model（EMBEDDING_BASE_URL、EMBEDDING_MODEL、EMBEDDING_API_KEY 均存在）
- **THEN** 索引 SHALL 包含 embedding 向量，混合检索使用 BM25 + 向量相似度加权
- **WHEN** 服务端未配置 embedding model
- **THEN** 系统 SHALL 仅使用 BM25 关键词检索（jieba 分词）

### Requirement: 索引增量更新
`execute_memory_write` 成功写入记忆文件后 SHALL 异步触发对应文件的索引重建。

#### Scenario: 写入 MEMORY.md 后更新索引
- **WHEN** `execute_memory_write` 成功写入 MEMORY.md
- **THEN** 系统 SHALL 异步重建 MEMORY.md 在 PostgreSQL memory_vectors 表中的分块索引

#### Scenario: 写入 daily note 后也更新索引
- **WHEN** `execute_memory_write` 写入 YYYY-MM-DD.md 文件
- **THEN** 系统 SHALL 异步触发该 daily note 文件的索引重建

### Requirement: memory_refresh 支持 RAG 检索
`memory_refresh()` SHALL 接受 query_hint 参数并传递给 `_load_memory()`，使大 MEMORY.md 场景下也能使用 RAG 检索。

#### Scenario: memory_refresh 传入 query_hint
- **WHEN** `compress_messages()` 调用 `memory_refresh()`
- **THEN** SHALL 从 history 中构造 query_hint 并传入

#### Scenario: memory_refresh 大记忆 RAG
- **WHEN** memory_refresh 执行时 MEMORY.md > 4000 字符且 query_hint 非空
- **THEN** `_load_memory()` SHALL 使用 RAG 检索返回相关片段，而非硬截断前 4000 字符

### Requirement: 合并重复搜索工具
系统 SHALL 仅保留 `search_memory` 工具，移除 `memory_search` 工具。

#### Scenario: 统一工具名称
- **WHEN** agent 需要搜索记忆
- **THEN** 系统 SHALL 仅提供 `search_memory` 工具，默认 top_k 为 5

#### Scenario: 移除 memory_search
- **WHEN** 系统加载工具定义
- **THEN** 工具列表 SHALL 不包含 `memory_search` 工具定义和对应的执行函数

### Requirement: 每日笔记按需检索注入
系统 SHALL 不再默认将每日笔记全文注入正常对话 system prompt，而是根据用户问题和 query_hint 按需检索相关片段。

#### Scenario: 正常对话不注入每日笔记全文
- **WHEN** 系统为正常对话构建 system prompt
- **THEN** 系统 MUST NOT 默认拼接今日或昨日每日笔记全文

#### Scenario: 用户询问近期记录时检索笔记
- **WHEN** 用户询问今天、昨天、最近或某个主题的历史记录
- **THEN** 系统 SHALL 使用 query_hint 检索 MEMORY.md 和 daily notes 的相关片段后注入上下文

#### Scenario: 无相关笔记片段时跳过
- **WHEN** daily notes 检索没有返回相关片段
- **THEN** 系统 SHALL 跳过每日笔记注入，而不是回退到全文注入

#### Scenario: 明确指定日期时可读取文件
- **WHEN** 用户明确要求查看某一天的笔记或指定 `notes/YYYY-MM-DD.md`
- **THEN** Agent SHALL 使用 `memory_read` 读取对应文件内容
