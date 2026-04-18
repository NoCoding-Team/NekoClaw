## MODIFIED Requirements

### Requirement: 工具 IPC 安全边界
系统 SHALL 通过 Electron ipcMain/ipcRenderer 严格隔离渲染进程与本地工具，渲染进程不直接访问 Node.js API。PC 端仅负责执行后端通过 WebSocket 转发的工具调用，不再本地生成工具定义或在前端运行 Agent 循环。

#### Scenario: 渲染进程调用本地工具
- **WHEN** 渲染进程通过 WebSocket 收到 `tool_call` 事件
- **THEN** 渲染进程 MUST 通过 `ipcRenderer.invoke()` 发送请求给主进程执行，由主进程处理并返回结果，最终通过 WebSocket `tool_result` 事件回传后端

#### Scenario: 未授权直接访问拦截
- **WHEN** 渲染进程尝试直接访问 `fs`、`child_process` 等 Node.js 模块
- **THEN** Electron contextIsolation 设置 SHALL 阻止此类访问

## REMOVED Requirements

### Requirement: 前端工具定义
**Reason**: 工具定义统一在后端管理（`services/tools/definitions.py`），前端不再需要维护工具 schema 列表。
**Migration**: 删除 `hooks/toolDefinitions.ts`。前端通过 WebSocket `tool_call` 事件接收工具调用信息，无需知道工具定义。

### Requirement: Memory 工具 IPC handler
**Reason**: Mode B 废弃后，Memory 工具由后端直接执行（`executor="server"`），前端不再需要本地 Memory IPC handler 来支持 Mode B 的工具调用。IPC handler 仍然保留用于支持后端通过 WebSocket 转发 Memory 工具调用的 fallback 场景（如果后端决定把 memory 工具标记为 client executor）。但当前设计中 Memory 工具为 server executor，因此前端 Memory IPC handler 不再被 Agent 循环调用。
**Migration**: 前端 `localTools.ts` 中的 `memory_*` 执行逻辑删除。Memory 工具仅在后端执行。

### Requirement: Memory 工具 IPC 安全约束
**Reason**: Memory 工具不再在前端执行，安全约束移到后端 `server_tools.py` 的路径验证逻辑中（已存在）。
**Migration**: 后端 `_validate_memory_path()` 已包含路径遍历防护和文件类型限制。
