## MODIFIED Requirements

### Tools

系统 SHALL 提供 `memory_write`、`memory_read`、`memory_search` 三个工具，全部在服务端执行（`server_tools.py`）。前端客户端 SHALL NOT 提供这三个工具的本地 IPC 执行路径。

#### Scenario: memory_write 服务端执行
- **WHEN** LLM 调用 `memory_write` 工具
- **THEN** 系统 SHALL 在服务端 `execute_server_tool` 中执行文件写入，不下发到客户端

#### Scenario: memory_read 服务端执行
- **WHEN** LLM 调用 `memory_read` 工具
- **THEN** 系统 SHALL 在服务端 `execute_server_tool` 中执行文件读取，不下发到客户端

#### Scenario: memory_search 服务端执行
- **WHEN** LLM 调用 `memory_search` 工具
- **THEN** 系统 SHALL 在服务端 `execute_server_tool` 中执行搜索，不下发到客户端

## REMOVED Requirements

### 前端记忆工具本地执行
**Reason**: 记忆工具统一为服务端执行，前端 `localTools.ts` 中 `memory_read`/`memory_write`/`memory_search` 的本地 IPC 分支不再需要
**Migration**: 从 `executeLocalTool` 的 switch 语句中删除 `memory_read`、`memory_write`、`memory_search` 三个 case
