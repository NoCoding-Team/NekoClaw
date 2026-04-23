## Context

NekoClaw 桌面端当前存在双轨存储架构：消息和记忆同时支持本地 IPC（`nekoBridge.memory.*`）和服务端存储。这导致：
- `useWebSocket.ts` 维护 ephemeral 模式（本地消息不入库）和 local_history 上传逻辑
- `localTools.ts` 中 memory_read/write/search 走 Electron IPC
- `MemoryPanel.tsx` 通过 `nekoBridge.memory.*` 读写本地文件
- 后端 `prepare()` 和 `ws.py` 存在 ephemeral 分支

用户决定：不考虑隐私性，全面转向服务端，桌面端仅保留 file/shell/browser 本地工具。部署架构为 Backend 独立服务器 + 远端 Docker Compose PostgreSQL，IP 白名单防护。

## Goals / Non-Goals

**Goals:**
- 桌面端去除所有本地记忆存储逻辑，成为纯 UI 瘦客户端
- 新增 Memory Files REST API，供 MemoryPanel 使用
- 删除 ephemeral 模式，简化消息发送链路
- 统一记忆工具执行路径为服务端

**Non-Goals:**
- 不修改 file/shell/browser 本地工具（仍通过 IPC 执行）
- 不修改后端记忆存储结构（`data/memory/{user_id}/*.md` 保持不变）
- 不迁移消息存储方案（PostgreSQL 保持不变）
- 不改动 Agent LangGraph 核心流程（prepare→llm_call→tools 循环不变）

## Decisions

### D1: Memory Files REST API 设计

新增 3 个端点，挂载在已有 memory router 下：

```
GET  /api/memory/files            → 列出用户记忆文件（name + modifiedAt）
GET  /api/memory/files/{path:path} → 读取文件内容
PUT  /api/memory/files/{path:path} → 写入文件内容
```

**理由**：复用已有的 `app/api/memory.py` router（已注册在 `router.py`），路径复用 `server_tools.py` 中的 `_validate_memory_path` 和 `_user_memory_dir` 函数，避免重复造轮子。新端点与已有的 DB 记忆端点（`GET /api/memory`、`POST /api/memory` 等）共存，前缀 `/files` 区分。

**备选方案**：新建独立 `api/memory_files.py` router。放弃——增加文件数量，且共用同一个 `/memory` 前缀更自然。

### D2: MemoryPanel 数据源切换

MemoryPanel 当前调用 `nekoBridge.memory.list/read/write`，改为 `apiFetch` 调用新 REST API。文件列表排序逻辑（PIN_ORDER 置顶）保持在前端不变。

**理由**：前端排序逻辑已经就绪，仅需替换数据源。服务端不需要关心排序。

### D3: localTools.ts 记忆分支移除

从 `executeLocalTool` 的 switch 中删除 `memory_read`、`memory_write`、`memory_search` 三个 case。这些工具调用现在由服务端 `execute_server_tool` 处理，通过 WebSocket tool_call 协议下发结果。

**理由**：当 Agent 发出 memory 工具调用时，后端 `tools` 节点已经在 `server_tools.py` 中处理了这些调用，不会下发到客户端。前端的 memory 分支是 ephemeral 模式的遗留物。

### D4: Ephemeral 模式全面移除

涉及 4 个文件：
1. `desktop/src/hooks/useWebSocket.ts` — 删除 `_ephemeralServerMap`、`_localHistorySentForSession`、`pendingLocalHistory`、`ephemeral`/`localHistory` 参数
2. `backend/app/api/ws.py` — 删除 `ephemeral`/`local_history` 解析和条件分支
3. `backend/app/services/agent/state.py` — 删除 `ephemeral`/`local_history` 字段
4. `backend/app/services/agent/nodes.py` — 删除 `prepare()` 中 `ephemeral` 分支

**理由**：ephemeral 模式是为"本地对话不存服务端"设计的。用户已决定全部走服务端，该模式失去存在意义。删除后 `prepare()` 仅保留 DB history 路径，简化代码。

### D5: Memory 写入后触发 RAG 索引更新

新 REST API 的 PUT 端点在写入 MEMORY.md 时，复用 `execute_memory_write` 已有的 `rebuild_memory_index` 钩子逻辑。

**理由**：用户通过 MemoryPanel 手动编辑 MEMORY.md 也应触发索引更新，保持 RAG 检索结果与文件内容一致。

## Risks / Trade-offs

- **[风险] MemoryPanel 失去离线可用性** → 已接受：用户确认不需要离线场景，服务端必须在线
- **[风险] ephemeral 模式移除后无法回退** → 缓解：ephemeral 代码在 Git 历史中保留，必要时可恢复
- **[风险] REST API 路径遍历** → 缓解：复用 `_validate_memory_path`（已有 `..` 检测 + `.md` 后缀白名单）
- **[权衡] 前端保留 nekoBridge 声明但减少使用** → 可接受：file/shell/browser 仍需要 IPC，nekoBridge 接口保留
