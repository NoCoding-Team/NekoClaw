### Requirement: MEMORY.md 超限 RAG 检索
`_load_memory` SHALL 在 MEMORY.md 内容超过 4000 字符时，使用 RAG 混合检索替代全文注入。

#### Scenario: 小记忆全文注入
- **WHEN** MEMORY.md 文件内容 ≤ 4000 字符
- **THEN** 系统 SHALL 将全文注入 system prompt（当前行为不变）

#### Scenario: 大记忆 RAG 检索注入
- **WHEN** MEMORY.md 文件内容 > 4000 字符
- **THEN** 系统 SHALL 使用 query_hint（会话标题 + 用户最后一条消息）对记忆索引执行混合检索，返回 top-K 相关片段拼接后注入 system prompt，总量不超过 4000 字符

#### Scenario: query_hint 构造
- **WHEN** `build_system_prompt` 调用 `_load_memory`
- **THEN** query_hint SHALL 由会话标题（Session.title）和最后一条用户消息（last HumanMessage content）以空格拼接构成

#### Scenario: 无 query_hint 时回退
- **WHEN** query_hint 为空字符串（如首次对话无标题）
- **THEN** 系统 SHALL 回退到暴力截断前 4000 字符的行为

### Requirement: 记忆独立索引
系统 SHALL 为每个用户的记忆文件建立独立的 SQLite 索引数据库，物理隔离于知识库索引。

#### Scenario: 索引数据库位置
- **WHEN** 系统创建记忆索引
- **THEN** 索引数据库 SHALL 存储于 `{STORAGE_ROOT}/{user_id}/memory_index.db`，与知识库 `knowledge.db` 分离

#### Scenario: 索引内容
- **WHEN** 系统构建记忆索引
- **THEN** 索引 SHALL 包含 MEMORY.md 的分块内容，支持 FTS5 全文检索

#### Scenario: embedding 可选
- **WHEN** 服务端配置了 embedding model（EMBEDDING_BASE_URL、EMBEDDING_MODEL、EMBEDDING_API_KEY 均存在）
- **THEN** 索引 SHALL 同时包含 embedding 向量，混合检索使用 FTS5 + 向量相似度加权
- **WHEN** 服务端未配置 embedding model
- **THEN** 索引 SHALL 仅使用 FTS5 关键词检索

### Requirement: 索引增量更新
`execute_memory_write` 成功写入 MEMORY.md 后 SHALL 异步触发对应文件的索引重建。

#### Scenario: 写入后更新索引
- **WHEN** `execute_memory_write` 成功写入 MEMORY.md
- **THEN** 系统 SHALL 异步重建 MEMORY.md 在 `memory_index.db` 中的分块索引

#### Scenario: 非 MEMORY.md 文件不索引
- **WHEN** `execute_memory_write` 写入的是 YYYY-MM-DD.md 或其他文件
- **THEN** 系统 SHALL 不触发索引更新（仅 MEMORY.md 需要 RAG 检索）
