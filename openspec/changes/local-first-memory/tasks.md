## 1. Electron MemoryService 基础设施

- [x] 1.1 在 `electron/main.ts` 实现 MemoryService：`read(path)`、`write(path, content)`、`list()` 三个方法，操作 `{userData}/memory/` 目录，包含路径遍历防护（拒绝 `..` 和绝对路径）和扩展名校验（仅 `.md`）
- [x] 1.2 注册 IPC handler：`memory:read`、`memory:write`、`memory:list`、`memory:search`，将请求委托给 MemoryService
- [x] 1.3 在 `electron/preload.ts` 通过 `contextBridge.exposeInMainWorld` 暴露 `nekoBridge.memory` 对象（read / write / list / search 方法）
- [x] 1.4 更新 `desktop/src/electron.d.ts` 添加 `nekoBridge.memory` 类型声明

## 2. 流式 Tool Call 解析

- [x] 2.1 修改 `streamOpenAI` 返回 `StreamResult`（content + toolCalls + finishReason），解析 `delta.tool_calls` 数组，按 index 累积拼接 id/name/arguments 片段
- [x] 2.2 修改 `streamAnthropic` 返回 `StreamResult`，解析 `content_block_start`（type=tool_use）+ `input_json_delta` 事件，累积拼接工具调用参数
- [x] 2.3 定义 `StreamResult` / `ToolCallDelta` TypeScript 接口

## 3. 前端工具定义

- [x] 3.1 新建 `desktop/src/hooks/toolDefinitions.ts`，导出 `getLocalToolDefinitions()` 函数，返回 OpenAI function calling schema 数组，包含 `memory_write`、`memory_read`、`memory_search` 及已有客户端工具
- [x] 3.2 在 `localTools.ts` 的 `executeLocalTool` 中新增 `memory_write`、`memory_read`、`memory_search` case，调用 `nekoBridge.memory.*`

## 4. Agentic Loop

- [x] 4.1 重构 `useLocalLLM.sendMessage`：将单次 stream 调用改为 `while` 循环（agentic loop），支持 LLM → tool_calls → 执行 → 追回消息 → 再次调用 LLM 的多轮流程
- [x] 4.2 集成安全防护：MAX_TOOL_ROUNDS 轮次上限（默认 10）、循环守卫（detectLoop）、调用上限（maxToolCallsPerRound）
- [x] 4.3 Agentic loop 中将 tool call 信息渲染为 UI 卡片（复用 useWebSocket 中 ToolCall 类型和 appendMessage 逻辑）

## 5. 记忆注入

- [x] 5.1 在 `sendMessage` 构建 system prompt 前，通过 `nekoBridge.memory.read` 读取 `MEMORY.md` + 今天/昨天的 `memory/YYYY-MM-DD.md`，拼接为 `## 长期记忆` + `## 近期笔记` 注入 system prompt
- [x] 5.2 添加注入长度限制：MEMORY.md 内容截断至约 4000 token（按字符估算），超出部分不注入
- [x] 5.3 移除 `extractMemoriesAsync` 函数及其在 `sendMessage` 末尾的调用

## 6. MemoryPanel UI 重写

- [x] 6.1 重写 `MemoryPanel.tsx` 左侧为文件列表视图：MEMORY.md 置顶，每日笔记按日期倒序，显示文件名和修改时间
- [x] 6.2 实现右侧 Markdown 渲染模式：选中文件后渲染 Markdown 内容
- [x] 6.3 实现编辑模式切换：编辑按钮 → 纯文本编辑器 → 保存/取消按钮
- [x] 6.4 实现"新建今日笔记"快捷按钮：创建 `memory/{today}.md` 或打开已有文件
- [x] 6.5 更新 `MemoryPanel.module.css` 适配新的文件浏览器 + 编辑器布局

## 7. 记忆语义搜索

- [ ] 7.1 在 MemoryService 中实现 `search(query)` 方法：有 embedding model 配置时，调用 embedding API 将 query 向量化 + SQLite 余弦相似度检索；无配置时 fallback 到关键词匹配
- [ ] 7.2 实现 embedding 索引管理：`memory:write` 成功后异步更新该文件的 embedding 向量（按段落/chunk 切分存入 SQLite）
- [ ] 7.3 在 `electron/main.ts` 初始化时检查是否有 embedding model 配置，存在则预建索引

## 8. 云端同步与后端适配

- [ ] 8.1 MemoryPanel 添加"上传到云端"按钮：选中文件 → POST 文件内容到后端 memory files API
- [ ] 8.2 MemoryPanel 添加"从云端拉取"按钮：GET 云端文件列表 → 选择下载 → 覆盖本地
- [ ] 8.3 后端新增 `/api/memory/files` REST API（GET 列表 / GET 内容 / PUT 写入），服务端存储用户记忆文件
- [ ] 8.4 后端 `_build_system_prompt` 改为从 Markdown 文件读取记忆内容（Mode A 路径），替代 DB SELECT
- [ ] 8.5 后端 `server_tools.py` 中 `save_memory` / `update_memory` 替换为 `memory_write` / `memory_read` / `memory_search`（操作服务端文件）
- [ ] 8.6 后端 `_memory_refresh` 更新静默消息，引导 LLM 使用 `memory_write` 工具
