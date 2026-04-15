# local-history

本地优先聊天记录存储能力。

---

## Overview

所有会话消息优先存储于 Electron 端本地 SQLite 数据库（`{userData}/neko.db`），保证用户在服务端不可用时仍可查看历史对话。用户可在设置中开启自动同步，将本地消息同步到服务端。

---

## Requirements

### Storage

- `R1.1`：Electron 主进程使用 `better-sqlite3` 管理 `{userData}/neko.db`
- `R1.2`：`neko.db` 包含 `local_sessions` 和 `local_messages` 两张表，schema 见 design.md D1
- `R1.3`：所有消息写入本地 SQLite 后，才通过 WebSocket 发送到服务端（写本地是前提）
- `R1.4`：`synced` 字段标记每条消息/会话的同步状态（0=未同步，1=已同步）

### IPC Bridge

- `R2.1`：preload 脚本暴露 `window.nekoBridge.db` 命名空间，包含：
  - `saveSession(session)` — 创建或更新本地会话
  - `saveMessage(msg)` — 追加一条消息
  - `getMessages(sessionId)` — 获取某会话全部消息（按 `created_at` 升序）
  - `getSessions()` — 获取全部会话列表（按 `created_at` 降序）
  - `getUnsyncedMessages(sessionId?)` — 获取未同步的消息
  - `markSynced(ids: string[])` — 批量标记已同步

### Message Flow

- `R3.1`：用户发消息时，前端先调用 `nekoBridge.db.saveMessage` 写本地，再发 WS
- `R3.2`：收到服务端 `llm_token` / `llm_done` 事件时，追加 assistant 消息到本地 SQLite
- `R3.3`：当自动同步关闭时，WS `message` payload 携带 `local_history`（最近 100 条，超出时截取最新的）
- `R3.4`：当自动同步开启时，WS `message` payload 不携带 `local_history`，服务端从 DB 读取

### Sync

- `R4.1`：设置页新增"聊天记录同步"开关，默认关闭，存于 `localStorage`（`neko_sync_enabled`）
- `R4.2`：同步开启时，每次发消息后异步批量同步未同步的消息到服务端（`POST /api/sessions/{id}/messages/batch`）
- `R4.3`：同步失败时，保留 `synced=0` 状态，下次发消息时重试，不阻塞用户操作
- `R4.4`：MemoryPanel 的"仅本机"tab 改为显示本地有但服务端未同步的会话数量（而非已废弃的本地记忆）

### Migration

- `R5.1`：首次启动时检测 `neko_local_memories.json` 是否存在
- `R5.2`：若存在，弹出一次性提示：是否将旧本地记忆导入到服务端记忆库；用户确认后执行导入，导入完成后删除该文件
- `R5.3`：若用户拒绝导入，直接删除 `neko_local_memories.json`，不再显示提示

### Backend Adaptation

- `R6.1`：服务端 `run_llm_pipeline` 接收 WS payload 中的 `local_history` 字段
- `R6.2`：当数据库中不存在该 `session_id` 的消息，且 `local_history` 不为空时，使用 `local_history` 作为消息历史上下文
- `R6.3`：使用 `local_history` 时，不向 `messages` 表写入这些历史消息（只写当前轮次的 user/assistant 消息）
- `R6.4`：`local_history` 中每条消息的 token 计数使用字符数估算（`len(content) // 4`），无需精确

---

## Out of Scope

- 多设备消息合并（冲突解决）
- 消息加密存储
- 本地消息全文搜索
- 自动备份 / 导出 neko.db
