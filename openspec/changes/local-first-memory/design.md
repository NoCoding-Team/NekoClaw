## Context

NekoClaw 当前架构：Electron + React 前端（`desktop/`）+ FastAPI 后端（`backend/`）。消息历史全量存于服务端 PostgreSQL，前端内存状态不持久化。记忆库（`Memory` 表）已有 CRUD 和注入逻辑，但本地记忆（`neko_local_memories.json`）从未接入 LLM pipeline，是死功能。

本设计覆盖：本地优先消息存储、LLM 主动记忆工具、memory refresh 机制、以及 WebSocket 协议的最小化扩展。

---

## Goals / Non-Goals

**Goals:**
- 确定本地存储方案（SQLite vs. JSONL vs. localStorage）
- 确定消息本地/服务端的同步策略和 source of truth
- 确定 LLM 主动记忆工具的接口设计和安全边界
- 确定 memory refresh 的触发时机和执行方式
- 确定 WS 协议扩展的最小化方案

**Non-Goals:**
- 语义记忆搜索 / embedding（后续，需要向量数据库）
- Dreaming sweep（OpenClaw 实验性功能，优先级低）
- 多设备记忆冲突合并（当前只考虑单设备）
- 离线 LLM 推理（不在本项目范围）

---

## Decisions

### D1：本地存储选型 — better-sqlite3

**选择**：`better-sqlite3`，存储于 `{userData}/neko.db`

**理由**：
- 同步 API，在 Electron 主进程中使用更简洁（无需 async/await 污染主进程代码）
- 单文件可移动、可备份，用户理解成本低
- 未来可存 embedding blob，支持本地语义搜索
- 对比 JSONL：可查询、可索引、不怕并发写；对比 localStorage：容量无上限，适合大量消息

**Schema（本地端）**：

```sql
CREATE TABLE local_sessions (
  id TEXT PRIMARY KEY,       -- 与服务端 session id 相同（有同步时）或 "local-{uuid}"
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,  -- Unix timestamp ms
  synced INTEGER DEFAULT 0      -- 0=未同步, 1=已同步
);

CREATE TABLE local_messages (
  id TEXT PRIMARY KEY,          -- UUID
  session_id TEXT NOT NULL REFERENCES local_sessions(id),
  role TEXT NOT NULL,           -- user | assistant | tool
  content TEXT,
  tool_calls TEXT,              -- JSON string
  token_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  synced INTEGER DEFAULT 0
);
```

---

### D2：消息 Source of Truth 与同步策略

**选择**：本地为主，服务端为可选副本

```
自动同步关闭（默认）：
  用户发消息
    → Electron 主进程写 local_messages（同步写，不会丢）
    → WS 发送时携带 local_history（近 N 条）作为上下文
    → 服务端 pipeline 使用 local_history，不写 DB messages 表
    → 服务端只写 Memory 表（记忆条目）

自动同步开启：
  用户发消息
    → Electron 写本地 SQLite（先写）
    → WS 发送同时，异步 POST /api/sessions/{id}/messages 批量同步
    → 服务端 pipeline 照常从 DB 读历史（已同步）
    → 失败时本地标记 synced=0，下次重试
```

**service end 的 pipeline 变化**（最小化）：

```python
# 现有代码：
history = await db.execute(select(Message).where(...))

# 新增：如果服务端没有该 session 的消息，使用客户端传来的 local_history
if not history and ws_payload.get("local_history"):
    history = [LocalMessage(**m) for m in ws_payload["local_history"]]
```

**关键决策**：服务端 `messages` 表不废弃，同步开启时仍然写入，保持向后兼容。

---

### D3：WS 协议最小化扩展

**扩展 `message` 事件 payload**：

```ts
// 现有
{ event: "message", content: string, skill_id: string|null, allowed_tools: string[]|null }

// 新增字段（可选）
{ 
  event: "message", 
  content: string, 
  skill_id: string|null,
  allowed_tools: string[]|null,
  local_history?: Array<{         // 仅在 sync_disabled 时携带
    role: string,                 // user | assistant | tool
    content: string | null,
    tool_calls: any[] | null,
    created_at: string,           // ISO string
  }>
}
```

`local_history` 只传最近的消息窗口（前端限制：`context_limit * 0.6 / avg_tokens_per_msg`，约 100 条上限），防止 payload 过大。

---

### D4：LLM 主动记忆工具接口

**两个新 server tools**：

```python
# save_memory
{
  "name": "save_memory",
  "executor": "server",
  "description": "保存需要跨对话记住的信息到记忆库。仅在对话中出现值得长期记住的事实、偏好或决策时调用。不要将临时性内容或当前任务细节存入记忆。",
  "parameters": {
    "category": "preference | fact | instruction | history | other",
    "content": "string (max 1000 chars)"
  }
}

# update_memory  
{
  "name": "update_memory",
  "executor": "server",
  "description": "更新或修正记忆库中已有的记忆条目。当用户纠正之前存入的信息时调用。",
  "parameters": {
    "memory_id": "string",
    "content": "string (max 1000 chars)",
    "category": "string (optional)"
  }
}
```

**安全边界**：
- content 长度限制 1000 字符（防止过长内容污染 system prompt）
- category 白名单：`["preference", "fact", "instruction", "history", "other"]`
- 写入前做基础 sanitization（去除控制字符）
- `update_memory` 必须校验 `memory_id` 属于当前 `user_id`

**system prompt 中的记忆使用引导**：

在 `_build_system_prompt` 的默认提示词中增加一段说明：
```
## 记忆使用规则
当对话中出现以下情况时，主动调用 save_memory 工具：
- 用户明确说"记住..."、"下次..."
- 用户透露持久性偏好（语言、格式、工具选择等）
- 用户提到关于自己的重要事实（职业、项目、习惯等）
不要将临时任务细节或本次对话专属内容存入记忆。
```

**Memory 表新增字段**：

```sql
ALTER TABLE memories ADD COLUMN last_used_at TIMESTAMP;
```

`_load_memory` 查询改为：
```python
ORDER BY COALESCE(last_used_at, created_at) DESC LIMIT 50
```
使最近被 LLM 读取/写入的记忆优先注入。

---

### D5：Memory Refresh（compaction 前）

**触发条件**：`total_tokens > context_limit * COMPRESS_RATIO`（即 compaction 即将触发前）

**执行方式**：在 `_compress_history()` 调用前插入一个静默轮次：

```python
# 压缩前 memory refresh
if needs_compression:
    await _memory_refresh(session_id, user_id, messages, llm_config, ws)
    # refresh 完成后再执行 compaction
    history = await _compress_history(...)
```

`_memory_refresh` 的实现：发送一条临时的 system 消息给 LLM：
```
"在我们总结对话前，请检查本次对话是否有值得长期记住的信息。如果有，请现在调用 save_memory 工具保存它们。如果没有，请回复'无需保存'。"
```
只处理 tool calls，忽略文字回复，执行完立即返回，不计入对话历史。

---

### D6：死代码清理策略

**删除范围**：
- `MemoryPanel.tsx`：删除 `LocalMemory` interface、`localMemories` state、`loadLocalMemories`、`saveLocalMemories`、`handleDeleteLocal`、`handleAddLocal`、`showAddLocal`、`source` tab 中的`local` 选项、列表中的 local 条目渲染
- `MemoryPanel.tsx`：保留服务端记忆的增删改查、导出/导入
- `preload.ts`：`nekoBridge.file.read/write` 保留（本地历史还需要用），但不再用于记忆存储
- 首次启动：检测 `neko_local_memories.json` 是否存在，如存在提示用户是否导入到服务端记忆库（一次性迁移）

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                         NekoClaw (新架构)                               │
│                                                                        │
│  ┌─────────────── Electron ───────────────┐                           │
│  │                                        │                           │
│  │  React UI                              │                           │
│  │    MemoryPanel (仅服务端记忆)           │                           │
│  │    ChatArea (读本地 SQLite 显示历史)    │                           │
│  │                                        │                           │
│  │  preload nekoBridge                    │                           │
│  │    .db.getMessages(sessionId)          │                           │
│  │    .db.saveMessage(msg)                │                           │
│  │    .db.syncStatus()                    │                           │
│  │                                        │                           │
│  │  Main Process                          │                           │
│  │    better-sqlite3 → neko.db            │                           │
│  │      local_sessions                    │                           │
│  │      local_messages                    │                           │
│  └───────────────────────────────────────-┘                           │
│              │ WS + local_history (when sync off)                      │
│              ▼                                                         │
│  ┌─────────────── FastAPI Backend ────────┐                           │
│  │                                        │                           │
│  │  run_llm_pipeline                      │                           │
│  │    ├── 读 messages from DB (sync on)    │                           │
│  │    │   OR local_history from WS payload │                           │
│  │    ├── _build_system_prompt             │                           │
│  │    │     _load_memory (Memory 表)       │                           │
│  │    ├── compaction 前 memory refresh     │                           │
│  │    └── tool 执行                        │                           │
│  │         ├── save_memory  ──────────────┼──→ Memory 表              │
│  │         └── update_memory ─────────────┼──→ Memory 表              │
│  │                                        │                           │
│  └────────────────────────────────────────┘                           │
│                         │                                              │
│                PostgreSQL                                              │
│                  memories (long-term)                                  │
│                  sessions / messages (当 sync on)                      │
└────────────────────────────────────────────────────────────────────────┘
```
