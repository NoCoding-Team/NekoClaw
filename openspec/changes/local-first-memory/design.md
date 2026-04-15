## Context

NekoClaw 当前记忆系统基于 PostgreSQL/SQLite `memories` 表存储原子化条目，通过 `save_memory`/`update_memory` server tool 写入，每次对话前 SELECT 最近 50 条注入 system prompt。这套设计在 Mode A（服务端托管）下基本可用，但在 Mode B（用户自定义 API Key、PC 端直连 LLM）下完全失效——`useLocalLLM` 的流式解析不支持 tool calls，LLM 返回的工具调用被静默丢弃。

OpenClaw 采用 Markdown 文件存储记忆（`MEMORY.md` + 每日笔记），用户可直接阅读和编辑，且天然适合本地优先场景。本次变更将记忆载体从数据库迁移到 Markdown 文件，同时为 Mode B 补齐 tool call 支持。

**约束**：
- Electron 主进程负责文件 I/O，渲染进程通过 IPC 访问
- 不迁移已有 `memories` 表数据，新旧并存
- 用户在模型中心已配置 embedding model（`AuxModelConfig`），可用于语义搜索

## Goals / Non-Goals

**Goals:**
- Mode B 下 LLM 可在对话流中通过 tool call 读写 Markdown 记忆文件
- 记忆文件本地优先存储，用户可手动同步到云端
- MemoryPanel 作为文件浏览器和编辑器，用户可直接查看和修改记忆
- 每次对话自动注入 `MEMORY.md` + 近两天每日笔记到 system prompt

**Non-Goals:**
- 自动云端同步（仅手动上传/拉取）
- 迁移已有 `memories` 表数据
- Dreaming sweep（后台记忆提炼）
- 多设备冲突解决
- 完整的向量数据库——使用轻量 embedding + SQLite 存储

## Decisions

### D1: 记忆文件结构

```
{userData}/memory/
├── MEMORY.md              # 长期记忆（用户画像、偏好、事实）
└── memory/
    ├── 2026-04-14.md      # 每日笔记
    ├── 2026-04-15.md
    └── ...
```

**选择**：平铺 Markdown 文件 + 日期分文件。
**替代方案**：SQLite FTS5 全文索引 → 对用户不透明，不可编辑；JSON 文件 → 不如 Markdown 人类友好。
**理由**：Markdown 可读、可编辑、可版本控制，与 OpenClaw 模型一致。

### D2: Mode B 流式 tool call 解析 + Agentic Loop

**选择**：修改 `streamOpenAI` / `streamAnthropic` 返回结构化 `StreamResult`（content + toolCalls + finishReason），`sendMessage` 包裹为 `while` 循环（agentic loop），每轮执行工具后将结果追加到 messages 再次调用 LLM。

```typescript
interface StreamResult {
  content: string
  toolCalls: { id: string; name: string; arguments: string }[] | null
  finishReason: string
}
```

**替代方案**：
- 对话后单独提取记忆（`extractMemoriesAsync`）→ 已实现但不支持 memory_read/search，且用户无感知。
- 非流式 agentic loop → 延迟过高，用户看不到打字效果。

**理由**：流式 + agentic loop 提供最完整的工具支持和最好的用户体验，且后端 `run_llm_pipeline` 已有此模式可参考。

### D3: 工具定义位于前端

**选择**：新建 `desktop/src/hooks/toolDefinitions.ts`，导出 `getLocalToolDefinitions(enabledSkills)` 返回 OpenAI function calling schema 数组。`memory_write`/`memory_read`/`memory_search` 始终包含，其余工具按启用状态过滤后一并传入 LLM API 的 `tools` 参数。

**理由**：Mode B 不经过后端，工具定义必须在前端维护。

### D4: Electron MemoryService 架构

**选择**：在 `electron/main.ts` 中注册 MemoryService，提供 IPC handler：
- `memory:read(path)` → `fs.readFile({userData}/memory/{path})`
- `memory:write(path, content)` → `fs.writeFile(...)` + 更新 embedding 索引
- `memory:list()` → 列目录
- `memory:search(query)` → 调用 embedding model API 获取 query vector → SQLite 余弦相似度检索

**preload.ts** 暴露 `nekoBridge.memory.*`，**localTools.ts** 新增 `memory_write`/`memory_read`/`memory_search` case 调用对应 IPC。

### D5: 记忆注入策略

**选择**：`sendMessage` 构建 system prompt 时：
1. 读取 `MEMORY.md` 全文
2. 读取今天 + 昨天的 `memory/YYYY-MM-DD.md`
3. 拼接为 `## 长期记忆\n{MEMORY.md}\n## 近期笔记\n{daily notes}` 注入 system prompt

**Mode A 路径**：后端 `_build_system_prompt` 同理改为读文件，文件存储在服务端用户目录。

### D6: MemoryPanel 设计

**选择**：左侧文件列表（MEMORY.md + daily notes 按日期倒序）+ 右侧 Markdown 渲染/编辑切换。底部操作栏：新建每日笔记、上传到云端、从云端拉取。

**替代方案**：保持原有 DB 条目列表 → 与新的 Markdown 文件体系不匹配。

### D7: Tool call 安全防护

复用 `useWebSocket.ts` 中已有的安全机制：
- 循环守卫（`detectLoop`）：检测重复调用
- 调用上限（`maxToolCallsPerRound`）：默认 20 次/轮
- 沙盒阈值 + 用户确认弹窗
- Tool whitelist

在 agentic loop 中集成相同逻辑，确保 Mode B 与 Mode A 安全一致。

## Risks / Trade-offs

- **[Embedding 模型依赖]** → `memory_search` 需要用户配置 embedding model；未配置时 fallback 到关键词搜索（文件内容 `includes` 匹配）。
- **[大文件性能]** → MEMORY.md 过大时注入 system prompt 占用大量 token → 限制注入长度（如前 4000 token），超出部分依赖 search 工具按需检索。
- **[Anthropic tool_use 格式差异]** → Anthropic SSE 的 tool_use 格式与 OpenAI 不同（content_block_start + input_json_delta），需要两套解析逻辑 → 已在 D2 中规划。
- **[Agentic loop 无限循环]** → LLM 反复调用工具不停止 → 通过 `MAX_TOOL_ROUNDS`（默认 10）和循环守卫兜底。
- **[文件并发写入]** → 多个 tool call 同时写同一文件 → 串行执行同一轮 tool calls，不并行。
