# active-memory

LLM 主动记忆能力——模仿 OpenClaw `memory_get` / `memory_search` 的工具驱动记忆机制。

---

## Overview

让 LLM 在对话中主动识别值得长期记住的信息，并通过工具调用将其写入记忆库。上下文压缩前自动触发 memory refresh，防止重要上下文因 compaction 丢失。记忆在每次对话开始时注入 system prompt，跨会话持久生效。

---

## Requirements

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

### Memory Injection

每次对话开始时，系统 SHALL 读取 Markdown 记忆文件并注入 system prompt，替代原有 DB SELECT + 拼接逻辑。

- 读取 `MEMORY.md`：≤ 4000 字符时全文注入，> 4000 字符时使用 RAG 混合检索（query_hint = 会话标题 + 用户最后一条消息）注入 top-K 相关片段
- 读取今天和昨天的 `memory/YYYY-MM-DD.md`
- 拼接为 `## 长期记忆\n{MEMORY.md 内容/RAG 结果}\n## 近期笔记\n{daily notes 内容}` 注入 system prompt

#### Scenario: Mode A 记忆注入（小记忆）
- **WHEN** 后端 `_build_system_prompt` 构建系统提示且 MEMORY.md ≤ 4000 字符
- **THEN** system prompt SHALL 包含 MEMORY.md 全文内容

#### Scenario: Mode A 记忆注入（大记忆）
- **WHEN** 后端 `_build_system_prompt` 构建系统提示且 MEMORY.md > 4000 字符
- **THEN** system prompt SHALL 包含从记忆索引 RAG 检索返回的相关片段，query 由会话标题和用户最后一条消息拼接

#### Scenario: 记忆文件不存在时
- **WHEN** `MEMORY.md` 或当天每日笔记文件不存在
- **THEN** 系统 SHALL 跳过该文件的注入，不报错

#### Scenario: _load_memory 签名变更
- **WHEN** `build_system_prompt` 调用 `_load_memory`
- **THEN** `_load_memory` SHALL 接受 `query_hint: str = ""` 参数，用于 RAG 检索

### System Prompt Guidance

`_build_system_prompt` 的默认提示词中记忆使用规则 SHALL 采用主动引导策略，明确区分 MEMORY.md、每日笔记和 USER.md 的使用场景。

#### Scenario: 默认模式记忆指引
- **WHEN** 非 Skill 模式构建 system prompt
- **THEN** system prompt SHALL 包含主动引导的记忆使用规则，明确以下行为：
  - 发现用户偏好、重要事实、关键决策时 SHALL 调用 `memory_write` 写入 MEMORY.md
  - 对话产生有价值的要点、结论时 SHALL 调用 `memory_write` 写入当日 YYYY-MM-DD.md
  - 发现用户个人信息（称呼、职业、时区等）时 SHALL 调用 `memory_write` 更新 USER.md
  - 写入前 SHALL 先 `memory_read` 读取已有内容，整合而非简单追加
  - 不 SHALL 包含"每轮最多 N 次"的调用频率限制

#### Scenario: 工具规则路径引导
- **WHEN** system prompt 包含工具使用规则（`_TOOL_RULES`）
- **THEN** 每日笔记路径说明 SHALL 使用 `notes/YYYY-MM-DD.md` 格式（如 `notes/2026-04-24.md`）

#### Scenario: 默认 AGENTS.md 模板路径
- **WHEN** 系统创建默认 AGENTS.md 模板（`_DEFAULT_AGENTS`）
- **THEN** 模板中每日笔记路径 SHALL 使用 `notes/YYYY-MM-DD.md` 格式

### Memory Refresh (Pre-Compaction)

`_memory_refresh` SHALL 引导 LLM 以整合模式维护 MEMORY.md、当日每日笔记和 USER.md。

#### Scenario: Compaction 前记忆刷新
- **WHEN** `total_tokens > context_limit * COMPRESS_RATIO` 触发 compaction
- **THEN** 系统 SHALL 先执行 `_memory_refresh`，静默请求 LLM 调用 `memory_write` 以整合模式保存重要信息

#### Scenario: Refresh Prompt 整合模式
- **WHEN** Memory Refresh 执行时
- **THEN** 发给 LLM 的 prompt SHALL 引导 LLM：
  1. 先 `memory_read("MEMORY.md")`、`memory_read("notes/YYYY-MM-DD.md")`、`memory_read("USER.md")` 读取已有内容
  2. 对 MEMORY.md 执行整合：新信息追加、冲突信息更新、重复信息合并、过时信息删除
  3. 向当日笔记追加对话要点
  4. 发现用户个人信息时更新 USER.md

#### Scenario: 不再限制每会话一次
- **WHEN** 当前会话已经执行过 Memory Refresh
- **THEN** 系统 SHALL 仍允许后续 Memory Refresh 执行（受最小轮次间隔保护约束）

#### Scenario: Memory Refresh 静默执行
- **WHEN** Memory Refresh 执行过程中
- **THEN** 系统 SHALL NOT 向用户 UI 发送可见消息

---

## Out of Scope

- Dreaming sweep（后台记忆提炼，可选实验性功能，后续迭代）
- 记忆去重 / 合并逻辑（当前靠 LLM 自主判断是否重复）
- Skill 模式下的自动记忆注入规则
