## 1. 后端 Memory Files REST API

- [x] 1.1 在 `app/api/memory.py` 中新增 `GET /api/memory/files` 端点：扫描 `{MEMORY_FILES_DIR}/{user_id}/` 目录，返回 `.md` 文件名和修改时间列表，目录不存在时返回空数组
- [x] 1.2 在 `app/api/memory.py` 中新增 `GET /api/memory/files/{path:path}` 端点：复用 `_validate_memory_path` 做路径安全校验，读取文件内容返回 JSON，文件不存在返回 404
- [x] 1.3 在 `app/api/memory.py` 中新增 `PUT /api/memory/files/{path:path}` 端点：写入文件内容（含控制字符清理），写入 MEMORY.md 时调用 `rebuild_memory_index`，自动创建父目录

## 2. 前端 MemoryPanel 改造

- [x] 2.1 重构 `MemoryPanel.tsx` 的 `loadFiles`：从 `nekoBridge.memory.list()` 改为 `apiFetch("GET /api/memory/files")`，适配新的响应格式
- [x] 2.2 重构 `MemoryPanel.tsx` 的 `readFile`：从 `nekoBridge.memory.read(name)` 改为 `apiFetch("GET /api/memory/files/{name}")`
- [x] 2.3 重构 `MemoryPanel.tsx` 的保存逻辑：从 `nekoBridge.memory.write(name, content)` 改为 `apiFetch("PUT /api/memory/files/{name}", {content})`
- [x] 2.4 移除 `MemoryPanel.tsx` 中对 `window.nekoBridge?.memory` 的所有引用，添加未登录/未连接时的提示状态

## 3. 删除 ephemeral 模式

- [x] 3.1 从 `backend/app/services/agent/state.py` 的 `AgentState` 中删除 `ephemeral` 和 `local_history` 字段
- [x] 3.2 从 `backend/app/services/agent/nodes.py` 的 `prepare()` 中删除 ephemeral 分支（`if ephemeral and local_history` 块），仅保留 DB history 路径
- [x] 3.3 从 `backend/app/api/ws.py` 中删除 `ephemeral`/`local_history` 解析和条件分支，简化消息处理流程
- [x] 3.4 从 `desktop/src/hooks/useWebSocket.ts` 中删除 `_ephemeralServerMap`、`_localHistorySentForSession`、`pendingLocalHistory` 及所有 ephemeral/localHistory 相关逻辑

## 4. 前端本地记忆工具移除

- [x] 4.1 从 `desktop/src/hooks/localTools.ts` 的 `executeLocalTool` 中删除 `memory_read`、`memory_write`、`memory_search` 三个 case 分支
- [x] 4.2 清理前端中对 `nekoBridge.memory` 的残余引用（类型定义 `electron.d.ts` 中保留接口声明但标记为 deprecated，或直接移除）

## 5. 验证与清理

- [x] 5.1 验证 MemoryPanel 通过 REST API 正常加载文件列表、查看和编辑文件
- [x] 5.2 验证 Agent 对话中 memory_write/read/search 工具在服务端正常执行
- [x] 5.3 验证 file/shell/browser 本地工具仍通过 IPC 正常工作
