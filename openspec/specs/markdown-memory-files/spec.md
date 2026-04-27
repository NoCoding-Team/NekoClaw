# markdown-memory-files

本地 Markdown 文件作为记忆载体——替代原有 DB memories 表，记忆以 `.md` 文件形式存储于用户数据目录。

---

## Overview

系统以 Markdown 文件存储 LLM 的记忆内容，`MEMORY.md` 为长期记忆，`YYYY-MM-DD.md` 为每日笔记。Electron 主进程通过 MemoryService 暴露 IPC handler，渲染进程通过 `nekoBridge.memory.*` 调用；语义搜索通过 embedding 向量索引实现，fallback 为关键词匹配。

---

## Requirements

### Markdown 记忆文件存储

系统 SHALL 以 Markdown 文件作为记忆载体，存储于 `{userData}/memory/` 目录下。`MEMORY.md` 为长期记忆文件，`notes/YYYY-MM-DD.md` 为每日笔记文件。

#### Scenario: 长期记忆文件位置不变
- **WHEN** 调用 `memory_write` 写入 `MEMORY.md`
- **THEN** 系统 SHALL 将内容写入 `{userData}/memory/{user_id}/MEMORY.md`（根目录，不变）

#### Scenario: 每日笔记文件创建于 notes/ 子目录
- **WHEN** 调用 `memory_write` 写入每日笔记
- **THEN** 系统 SHALL 将内容写入 `{userData}/memory/{user_id}/notes/YYYY-MM-DD.md`，`notes/` 目录不存在时自动创建

### 记忆注入上下文
每次对话开始时，系统 SHALL 读取长期记忆，并 SHALL 仅在用户问题或 query_hint 需要时按需检索或读取 `notes/` 子目录下的每日笔记。

#### Scenario: 默认不读取今日笔记全文
- **WHEN** `_load_memory` 构建正常对话的记忆上下文
- **THEN** 系统 MUST NOT 默认读取 `{user_dir}/notes/{today}.md` 的全文注入 system prompt

#### Scenario: 默认不读取昨日笔记全文
- **WHEN** `_load_memory` 构建正常对话的记忆上下文
- **THEN** 系统 MUST NOT 默认读取 `{user_dir}/notes/{yesterday}.md` 的全文注入 system prompt

#### Scenario: 按需检索每日笔记
- **WHEN** 用户问题涉及今日、昨日、最近记录或某个历史主题
- **THEN** 系统 SHALL 通过记忆检索返回相关 daily note 片段，而不是注入完整文件

#### Scenario: 笔记文件不存在时
- **WHEN** 需要检索或读取的每日笔记文件不存在
- **THEN** 系统 SHALL 跳过该文件，不报错

### Requirement: 记忆工具使用边界
系统 SHALL 明确区分 `search_memory`、`memory_read` 和 `memory_write` 的适用场景。

#### Scenario: 查询历史记忆使用 search_memory
- **WHEN** 用户询问过去是否提到某事、最近记录、历史偏好或某个主题
- **THEN** Agent SHALL 优先使用 `search_memory` 检索相关记忆和每日笔记片段

#### Scenario: 明确读取文件使用 memory_read
- **WHEN** 用户明确要求查看 `MEMORY.md`、`USER.md`、`notes/YYYY-MM-DD.md` 或其他具体记忆文件
- **THEN** Agent SHALL 使用 `memory_read` 读取该文件

#### Scenario: 写入前读取目标文件
- **WHEN** Agent 需要更新已有记忆文件
- **THEN** Agent SHALL 先使用 `memory_read` 读取目标文件当前内容，再使用 `memory_write` 写回整合后的完整内容

#### Scenario: 保存长期信息使用 memory_write
- **WHEN** 用户明确要求记住信息，或对话中出现需要长期保存的偏好、关键事实或重要决策
- **THEN** Agent SHALL 使用 `memory_write` 写回对应记忆文件

### Electron MemoryService

系统 SHALL 在 Electron 主进程中实现 MemoryService，通过 IPC handler 暴露文件操作能力。

#### Scenario: 读取记忆文件
- **WHEN** 渲染进程调用 `nekoBridge.memory.read(path)`
- **THEN** 主进程 SHALL 读取 `{userData}/memory/{path}` 文件内容并返回字符串，文件不存在时返回空字符串

#### Scenario: 写入记忆文件
- **WHEN** 渲染进程调用 `nekoBridge.memory.write(path, content)`
- **THEN** 主进程 SHALL 将 content 写入 `{userData}/memory/{path}`，目录不存在时自动创建

#### Scenario: 列举记忆文件
- **WHEN** 渲染进程调用 `nekoBridge.memory.list()`
- **THEN** 主进程 SHALL 返回 `{userData}/memory/` 下所有 `.md` 文件列表，包含文件名、相对路径、修改时间，按修改时间倒序排列

#### Scenario: preload 类型暴露
- **WHEN** Electron 应用启动
- **THEN** `preload.ts` SHALL 通过 `contextBridge.exposeInMainWorld` 暴露 `nekoBridge.memory` 对象，包含 `read`、`write`、`list`、`search` 方法

### 记忆语义搜索

系统 SHALL 提供基于 embedding 的记忆文件语义搜索能力。

#### Scenario: 有 embedding 模型时搜索
- **WHEN** 用户已配置 embedding model 且调用 `nekoBridge.memory.search(query)`
- **THEN** 系统 SHALL 调用 embedding model API 将 query 向量化，在 SQLite 向量索引中检索 top-K 相似片段并返回

#### Scenario: 无 embedding 模型时 fallback
- **WHEN** 用户未配置 embedding model 且调用 `nekoBridge.memory.search(query)`
- **THEN** 系统 SHALL 对所有记忆文件内容执行关键词匹配搜索并返回包含关键词的片段

#### Scenario: 写入后自动更新索引
- **WHEN** `memory_write` 成功写入文件
- **THEN** 系统 SHALL 异步更新该文件对应的 embedding 索引条目
