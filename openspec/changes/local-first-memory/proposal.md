## Why

当前 NekoClaw 记忆体系存在三个根本问题：

1. **本地记忆是死功能**：`neko_local_memories.json` 中的本地记忆只在 MemoryPanel 中展示，从未注入到 LLM 的 system prompt，猫咪对这些记忆一无所知，整个功能对实际对话零贡献。

2. **聊天记录完全依赖服务端**：消息只持久化在服务端 PostgreSQL，前端 Zustand `messagesBySession` 不持久化，服务端不可用或用户未登录时无法查看任何历史对话。

3. **LLM 无法主动记忆**：LLM 只能被动接收用户通过 MemoryPanel 手动添加的记忆，无法在对话中自动识别并保存有价值的信息（偏好、事实、决策），记忆库完全依赖用户手动维护。

## What Changes

- **移除死代码**：删除 `neko_local_memories.json` 机制及 MemoryPanel 中本地记忆的增删改查 UI
- **本地优先聊天记录**：Electron 端引入 SQLite（`neko.db`），所有会话消息先写本地；用户可在设置中开启自动同步到服务端；MemoryPanel 的"仅本机"tab 改为显示未同步消息的会话
- **LLM 主动记忆工具**：新增 `save_memory` / `update_memory` server tools，让 LLM 在对话中识别值得记住的信息并主动写入记忆库（类似 OpenClaw `memory_get` / `memory_search` 机制）
- **记忆自动刷新**：上下文压缩（compaction）发生前，触发一个静默 memory refresh 轮次，让 LLM 将本次对话中重要的上下文主动保存到记忆库

## Capabilities

### New Capabilities

- `local-history`: 本地优先聊天记录——`better-sqlite3` 存储于 `{userData}/neko.db`，支持离线查看全部历史，设置中可开关自动同步到服务端
- `active-memory`: LLM 主动记忆——`save_memory` / `update_memory` server tools，LLM 在对话中自动提炼事实写入记忆库；compaction 前自动 memory refresh，防止重要上下文因压缩丢失

### Modified Capabilities

- `memory-system`: 移除死代码（本地 JSON 记忆）；记忆注入逻辑增加 `last_used_at` 排序，优先注入近期被 LLM 访问过的条目；上限从硬编码 50 条改为可配置
- `session-management`: WebSocket `message` 事件扩展 `local_history` 字段，在服务端未存储消息历史时由客户端补全上下文；pipeline 读取历史时优先使用服务端 DB，fallback 到客户端传来的 `local_history`

## Impact

- **PC 端**：新增 `better-sqlite3`依赖（Electron native module，需 `electron-rebuild`）；主进程负责 SQLite 读写；preload `nekoBridge` 新增 `db.*` 命名空间；`neko_local_memories.json` 废弃，首次启动检测并提示迁移
- **服务端**：`server_tools.py` 新增 `save_memory` / `update_memory`；`definitions.py` 注册新工具；`run_llm_pipeline` 支持 `local_history` fallback；compaction 前增加 memory refresh 轮次（不超过 1 轮，静默执行）
- **通信协议**：WS `message` 事件 payload 扩展 `local_history?: Message[]` 字段
- **存储**：`neko.db` 新增 `local_sessions` 和 `local_messages` 表；`memories` 表新增 `last_used_at` 字段
- **安全**：`save_memory` / `update_memory` 在服务端执行，content 长度限制 1000 字符，category 白名单校验，防止 prompt 注入
