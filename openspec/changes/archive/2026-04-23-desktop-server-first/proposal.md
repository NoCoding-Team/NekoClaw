## Why

桌面端当前存在消息/记忆双轨存储（本地 IPC + 服务端），增加了代码复杂度和数据一致性风险。用户已决定不考虑隐私性、全面转向服务端存储，需要将桌面端瘦身为纯 UI 瘦客户端，仅保留必须在本地执行的 file/shell/browser 工具。

## What Changes

- **BREAKING** 删除 ephemeral 会话模式（前端 `useWebSocket.ts` 中的 `ephemeral`/`local_history` 逻辑 + 后端 `prepare()` 中的 ephemeral 分支）
- 从 `localTools.ts` 移除 `memory_read`/`memory_write`/`memory_search` 三个本地 IPC 分支，记忆工具统一走服务端 `server_tools.py`
- 新增 Memory Files REST API（`GET /api/memory/files`、`GET /api/memory/files/{path}`、`PUT /api/memory/files/{path}`），为 MemoryPanel 提供服务端读写接口
- 重构 `MemoryPanel.tsx`：从 `nekoBridge.memory.*` IPC 调用改为 `apiFetch` REST 调用
- 清理前端中与本地记忆存储相关的残余代码和类型定义

## Capabilities

### New Capabilities
- `memory-files-api`: 服务端 Memory Files REST API，提供记忆文件列表/读取/写入的 HTTP 端点

### Modified Capabilities
- `memory-panel-editor`: MemoryPanel 数据源从本地 IPC 切换为服务端 REST API
- `active-memory`: 记忆工具执行路径统一为服务端，移除前端本地 IPC 分支
- `local-tools`: 从本地工具列表中移除 memory_read/write/search，仅保留 file/shell/browser
- `langgraph-agent`: 删除 prepare() 节点中的 ephemeral 模式分支

## Impact

- **前端**：`useWebSocket.ts`、`localTools.ts`、`MemoryPanel.tsx`、`store/app.ts` 需要修改
- **后端**：`nodes.py`（删除 ephemeral）、`ws.py`（简化消息处理）、新增 `api/memory_files.py` REST 路由
- **API**：新增 3 个 REST 端点（`/api/memory/files*`）
- **破坏性变更**：依赖 ephemeral 模式的前端调用方式将不再可用
