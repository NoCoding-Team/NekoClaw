## ADDED Requirements

### Requirement: Markdown 记忆文件存储
系统 SHALL 以 Markdown 文件作为记忆载体，存储于 `{userData}/memory/` 目录下。`MEMORY.md` 为长期记忆文件，`memory/YYYY-MM-DD.md` 为每日笔记文件。

#### Scenario: 长期记忆文件创建
- **WHEN** 首次调用 `memory_write` 写入 `MEMORY.md` 且文件不存在
- **THEN** 系统 SHALL 自动创建 `{userData}/memory/MEMORY.md` 文件并写入内容

#### Scenario: 每日笔记文件创建
- **WHEN** 调用 `memory_write` 写入 `memory/2026-04-15.md` 且文件不存在
- **THEN** 系统 SHALL 自动创建 `{userData}/memory/memory/2026-04-15.md` 文件并写入内容，父目录不存在时自动创建

#### Scenario: 文件路径限制
- **WHEN** `memory_write` 或 `memory_read` 传入包含 `..` 或绝对路径的 path 参数
- **THEN** 系统 SHALL 拒绝操作并返回路径非法错误，防止目录遍历

### Requirement: Electron MemoryService
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

### Requirement: 记忆语义搜索
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
