## 1. 死代码清理

- [ ] 1.1 删除 `MemoryPanel.tsx` 中所有 `LocalMemory` / `localMemories` 相关代码（interface、state、读写逻辑、UI 渲染）
- [ ] 1.2 删除 `MemoryPanel.tsx` 中 `source` state 及"仅本机"source tab UI，简化为仅保留 category 过滤
- [ ] 1.3 删除 `MemoryPanel.tsx` 中 `dataPath` / `localMemPath` 相关逻辑（nekoBridge.app.getDataPath 调用）

## 2. Electron SQLite 基础设施

- [ ] 2.1 安装 `better-sqlite3` 及其 TypeScript 类型定义（`@types/better-sqlite3`）；配置 `electron-rebuild` 确保 native module 与 Electron 版本匹配
- [ ] 2.2 在 Electron 主进程（`electron/main.ts`）中初始化 `neko.db`，创建 `local_sessions` 和 `local_messages` 表（`IF NOT EXISTS`）
- [ ] 2.3 封装 `DbService`（主进程）：`saveSession`、`saveMessage`、`getMessages`、`getSessions`、`getUnsyncedMessages`、`markSynced`
- [ ] 2.4 在 `preload.ts` 中通过 IPC 暴露 `window.nekoBridge.db.*` 接口，对应主进程 `DbService` 的各方法
- [ ] 2.5 在 `electron.d.ts` 中补充 `nekoBridge.db` 的 TypeScript 类型声明

## 3. 本地优先消息流

- [ ] 3.1 修改 `useWebSocket.ts`：发消息前先调用 `nekoBridge.db.saveMessage` 将 user 消息写入本地 SQLite
- [ ] 3.2 修改 `useWebSocket.ts`：收到 `llm_done` 事件后，将完整的 assistant 消息写入本地 SQLite
- [ ] 3.3 修改 `useWebSocket.ts`：根据 `neko_sync_enabled` 设置决定是否在 WS payload 中携带 `local_history`；`local_history` 取最近 100 条（超出截断最旧的）
- [ ] 3.4 修改 `ChatArea.tsx` 或会话加载逻辑：打开会话时从本地 SQLite 加载历史消息（优先本地，服务端作为 fallback）

## 4. 设置：同步开关

- [ ] 4.1 在 `store/app.ts` 中新增 `syncEnabled: boolean`（持久化到 `localStorage` key `neko_sync_enabled`，默认 `false`）
- [ ] 4.2 在设置页面（`PersonalizationPanel.tsx` 或独立设置组件）新增"聊天记录同步到服务端"开关 UI
- [ ] 4.3 同步开启时，`useWebSocket.ts` 中消息发送后异步触发批量同步（调用 `POST /api/sessions/{id}/messages/batch`，失败时静默保留 `synced=0`）

## 5. 服务端：本地历史 Fallback

- [ ] 5.1 修改 `backend/app/api/ws.py` 中的消息接收逻辑，从 WS payload 中解析 `local_history` 字段并传入 pipeline
- [ ] 5.2 修改 `run_llm_pipeline` 函数签名，新增 `local_history` 参数（`list[dict] | None`）
- [ ] 5.3 在 `run_llm_pipeline` 中，当数据库查询结果为空且 `local_history` 不为 None 时，使用 `local_history` 构建消息上下文
- [ ] 5.4 新增 `POST /api/sessions/{session_id}/messages/batch` 接口，支持客户端批量上传消息（幂等，重复 message_id 忽略）

## 6. 迁移：旧本地记忆

- [ ] 6.1 在 Electron 主进程启动时检测 `{userData}/neko_local_memories.json` 是否存在
- [ ] 6.2 若存在且 token 有效（已登录），向渲染进程发送 `migrate-local-memories` 事件，前端展示一次性迁移提示弹窗
- [ ] 6.3 用户确认导入时，将旧本地记忆调用 `POST /api/memory` 批量写入服务端；用户拒绝时直接跳过
- [ ] 6.4 提示处理完成后删除 `neko_local_memories.json`（无论用户选择导入还是拒绝）

## 7. LLM 主动记忆工具

- [ ] 7.1 在 `backend/app/services/tools/definitions.py` 中注册 `save_memory` 工具定义（executor: server）
- [ ] 7.2 在 `backend/app/services/tools/definitions.py` 中注册 `update_memory` 工具定义（executor: server）
- [ ] 7.3 在 `backend/app/services/tools/server_tools.py` 中实现 `execute_save_memory(args, user_id)`：category 白名单校验 + content sanitization + 写入 Memory 表 + 更新 `last_used_at`
- [ ] 7.4 在 `backend/app/services/tools/server_tools.py` 中实现 `execute_update_memory(args, user_id)`：校验 memory_id 归属 + content sanitization + 更新 Memory 表
- [ ] 7.5 修改 `execute_server_tool` 入口，将 `user_id` 传入（当前工具执行不携带 user_id，需要扩展）
- [ ] 7.6 在 `_build_system_prompt` 的默认提示词中新增记忆使用规则段落（见 active-memory spec R3.1）

## 8. Memory 表扩展

- [ ] 8.1 在 `backend/app/models/memory.py` 中新增 `last_used_at: Mapped[datetime | None]` 字段
- [ ] 8.2 创建对应 Alembic migration（或在 `startup.py` 中使用 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` 兼容方式）
- [ ] 8.3 修改 `backend/app/services/llm.py` 中 `_load_memory` 的排序逻辑：`ORDER BY COALESCE(last_used_at, created_at) DESC`

## 9. Memory Refresh（compaction 前）

- [ ] 9.1 在 `backend/app/services/llm.py` 中实现 `_memory_refresh(session_id, user_id, messages, llm_config, ws)` 函数
- [ ] 9.2 `_memory_refresh` 向 LLM 发送静默 system 消息（不写入 DB，不推送 token 到前端），处理 tool calls 后返回
- [ ] 9.3 在 `run_llm_pipeline` 中，compaction 判断条件满足时，先调用 `_memory_refresh` 再调用 `_compress_history`；使用布尔标志防止同一对话重复触发

## 10. MemoryPanel UI 更新

- [ ] 10.1 完成死代码清理（依赖任务 1.x）后，重新审视 MemoryPanel 结构，确认 source tab 已正确简化
- [ ] 10.2 若 `syncEnabled=false`，在 MemoryPanel 顶部显示提示条："聊天记录存储于本机，未开启同步"，附"前往设置"链接
