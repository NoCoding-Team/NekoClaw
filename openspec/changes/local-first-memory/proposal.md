## Why

当前记忆系统基于数据库行（`save_memory` / `update_memory` 工具写入 DB 表），存在根本局限：

1. **Mode B（本地直连）无法触发记忆**：`useLocalLLM` 的流式解析只处理文本 delta，完全忽略 tool_calls，LLM 想保存记忆却无法执行。
2. **记忆不可编辑、不可读**：DB 行对用户是黑箱，无法像笔记一样浏览、编辑或理解。
3. **与 OpenClaw 记忆模型脱节**：OpenClaw 使用 Markdown 文件（`MEMORY.md` + 每日笔记），支持 compaction、dreaming 等高级流程；当前 DB 设计无法对接。

需要将记忆从"数据库条目"转变为"本地优先的 Markdown 文件"，同时为 Mode B 补齐 tool call 能力，让本地 LLM 能在对话中直接读写记忆文件。

## What Changes

- **Markdown 记忆文件体系**：以 `{userData}/memory/MEMORY.md`（长期记忆）和 `memory/YYYY-MM-DD.md`（每日笔记）替代数据库 memories 表作为记忆载体。
- **Electron MemoryService**：主进程新增文件 I/O 服务，通过 IPC 暴露 `nekoBridge.memory.*`（read / write / list / search）。
- **Mode B 流式 tool call 支持**：`streamOpenAI` 和 `streamAnthropic` 解析 tool_calls delta，`sendMessage` 改为 agentic while-loop，支持多轮工具调用。
- **本地工具定义**：前端新增 `toolDefinitions.ts`，提供 `memory_write`、`memory_read`、`memory_search` 等工具的 OpenAI function calling schema，随请求发送给 LLM API。
- **记忆注入重构**：每次对话前读取 `MEMORY.md` + 今天/昨天的每日笔记，注入 system prompt，替代当前 DB SELECT + 拼接逻辑。
- **MemoryPanel 重新设计**：从数据库条目列表改为 Markdown 文件浏览器 + 内联编辑器，支持手动上传到云端。
- **移除 `extractMemoriesAsync`**：不再需要对话后单独提取记忆，LLM 在对话中通过 tool call 直接操作记忆文件。

## Capabilities

### New Capabilities
- `markdown-memory-files`: Markdown 文件作为记忆载体的读写、列举与目录管理
- `local-streaming-tool-calls`: Mode B 流式响应中解析、执行 tool calls 并实现 agentic loop
- `memory-panel-editor`: MemoryPanel 作为 Markdown 文件浏览器和编辑器的 UI

### Modified Capabilities
- `active-memory`: 工具从 `save_memory`/`update_memory`（DB 写入）变更为 `memory_write`/`memory_read`/`memory_search`（Markdown 文件操作），记忆注入从 DB SELECT 变更为文件读取
- `local-tools`: 新增 `memory_write`/`memory_read`/`memory_search` 三种本地工具及对应 IPC handler

## Impact

- **Electron 主进程**：新增 MemoryService 模块 + IPC handler 注册 + preload 类型扩展
- **`useLocalLLM.ts`**：流式解析函数签名变更（返回 `StreamResult`），`sendMessage` 重构为 agentic loop
- **`localTools.ts`**：扩展 `executeLocalTool` switch，新增 memory 分支
- **`MemoryPanel.tsx`**：完全重写为文件浏览器 + Markdown 渲染/编辑器
- **后端（Mode A 路径）**：`_build_system_prompt` 和 `_load_memory` 需适配 Markdown 文件存储；`server_tools.py` 工具替换
- **现有 DB**：`memories` 表保留不迁移，新系统与旧表并存
- **依赖**：可能需要 Markdown 渲染库（前端）；embedding search 依赖用户配置的 embedding model
