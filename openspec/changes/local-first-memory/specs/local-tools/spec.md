## ADDED Requirements

### Requirement: Memory 工具 IPC handler
系统 SHALL 在 Electron 主进程注册 `memory:read`、`memory:write`、`memory:list`、`memory:search` IPC handler，渲染进程通过 `nekoBridge.memory.*` 调用。

#### Scenario: memory_write 本地工具执行
- **WHEN** `executeLocalTool` 收到 `memory_write` 工具调用
- **THEN** 系统 SHALL 调用 `nekoBridge.memory.write(path, content)` 执行文件写入并返回结果

#### Scenario: memory_read 本地工具执行
- **WHEN** `executeLocalTool` 收到 `memory_read` 工具调用
- **THEN** 系统 SHALL 调用 `nekoBridge.memory.read(path)` 读取文件内容并返回结果

#### Scenario: memory_search 本地工具执行
- **WHEN** `executeLocalTool` 收到 `memory_search` 工具调用
- **THEN** 系统 SHALL 调用 `nekoBridge.memory.search(query)` 执行语义搜索并返回结果

### Requirement: Memory 工具 IPC 安全约束
Memory IPC handler SHALL 限制文件操作范围在 `{userData}/memory/` 目录内。

#### Scenario: 路径遍历防护
- **WHEN** 调用 `memory:write` 或 `memory:read` 的 path 参数包含 `..` 或指向 `{userData}/memory/` 之外
- **THEN** 系统 SHALL 拒绝操作并返回路径非法错误

#### Scenario: 文件类型限制
- **WHEN** 调用 `memory:write` 的 path 参数扩展名不是 `.md`
- **THEN** 系统 SHALL 拒绝操作并返回文件类型错误
