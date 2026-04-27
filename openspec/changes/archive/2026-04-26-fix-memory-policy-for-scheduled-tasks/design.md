## Context

NekoClaw 当前的记忆系统由三条链路组成：正常对话的 system prompt 记忆注入、对话后的 `memory_refresh()` 自动整理、每日笔记和 daily digest 后台整理。新增定时任务后，周期性任务会自动创建会话并运行 Agent，如果不区分来源，天气、提醒、临时状态查询等计划任务可能被当作用户长期偏好或关键事实保存。

同时，`_load_memory()` 会默认把今日和昨日每日笔记全文加入正常对话上下文，这会增加 prompt 体积，并把很多不相关的临时信息暴露给每轮对话。工具层面也存在语义不清：模型容易把 `memory_read` 当作所有记忆查询入口，而不是先用检索工具定位相关内容。

## Goals / Non-Goals

**Goals:**
- 定时任务会话默认采用只读或不写入的记忆策略，避免临时任务结果污染长期记忆。
- 正常对话不再默认注入 daily notes 全文；每日笔记改为按需检索或按明确文件读取。
- 明确 `search_memory`、`memory_read`、`memory_write` 的使用边界，让模型选择更自然。
- daily digest 和 memory refresh 能识别并跳过定时任务产生的低价值临时会话内容。
- 记忆面板保持列表轻量，只在用户选中文件时读取内容。

**Non-Goals:**
- 不移除每日笔记和 daily digest 功能。
- 不禁止用户手动把定时任务结果写入记忆。
- 不重写记忆文件存储格式。
- 不引入新的向量数据库或调度系统。

## Decisions

### 用会话来源和记忆策略隔离定时任务

为定时任务创建的会话增加可持久化的来源或策略字段，例如 `source = "scheduled_task"` 与 `memory_policy = "read_only"`。正常用户对话使用 `source = "chat"` 与 `memory_policy = "auto"`。`memory_refresh()`、每日笔记生成和 daily digest 读取会话或消息时，必须根据策略跳过 `read_only/no_write` 来源。

替代方案是在 prompt 中仅提示模型不要写记忆，但这依赖模型遵守，不足以防止自动整理流程把内容纳入长期记忆。

### 定时任务使用专用执行提示词

定时任务消息发送到 Agent 时追加任务元信息：这是计划任务、由系统按时间触发、结果默认是临时执行输出。Agent 可使用任务保存的 `allowed_tools` 完成工作，但不得主动把结果写入长期记忆，除非任务描述或用户后续明确要求“记住/保存到记忆”。

这样既保留工具能力，又把“计划任务输出”和“用户主动告诉我的长期事实”区分开。

### daily notes 只按需进入上下文

正常对话上下文默认只注入 `MEMORY.md` 的全文或 RAG 片段。daily notes 不再直接拼接全文；当 query_hint 指向“今天/昨天/最近记录/某个主题”时，使用现有记忆索引检索相关 daily note 片段，或在用户明确指定日期/文件时使用 `memory_read` 读取。

这比全文注入更省 token，也减少临时信息影响模型回复。

### 记忆工具语义收敛

系统提示和工具描述统一为：
- `search_memory`：记忆和每日笔记的默认查询入口，适合“找一下/之前有没有/最近提过什么”。
- `memory_read`：读取明确文件路径，或在写入前读取目标文件完整内容。
- `memory_write`：只在确认需要保存、更新或整理后写回完整文件内容。

当前工具名是 `search_memory`，不要引入 `memory_search` 新名称。

### 记忆面板坚持按需加载

`GET /api/memory/files` 只返回文件元数据，不返回内容。前端只在选中文件、生成今日笔记后展示、或编辑前读取对应文件内容。后续如果 daily notes 数量很大，可在列表接口增加分页或目录过滤，但本次先保证不做全量内容加载。

## Risks / Trade-offs

- [Risk] 定时任务确实产生了有长期价值的信息却被默认跳过。→ 支持任务描述中明确“记住/保存到长期记忆”，或用户打开任务会话后手动要求保存。
- [Risk] 不默认注入 daily notes 后，模型可能忘记昨天刚聊过的临时内容。→ query_hint 触发 `search_memory` 检索 daily note 片段；用户明确问日期时可读取具体笔记。
- [Risk] 新增会话字段需要兼容旧数据。→ 启动迁移补默认值：旧会话视为 `source="chat"`、`memory_policy="auto"`。
- [Risk] 工具规则过严导致模型少写记忆。→ 系统提示保留“用户明确要求记住”和“重要长期事实”两类自动写入场景。

## Migration Plan

1. 为会话或任务执行链路增加 `source` / `memory_policy` 字段，旧会话默认 `chat/auto`。
2. 定时任务创建会话时写入 `scheduled_task/read_only` 或等价策略。
3. 更新 `memory_refresh()`、每日笔记生成查询、daily digest 入口过滤逻辑。
4. 调整 `_load_memory()`：移除 daily notes 全文默认拼接，改为基于 query_hint 的检索片段。
5. 更新工具定义和系统提示词，统一 `search_memory` / `memory_read` / `memory_write` 语义。

## Open Questions

- 定时任务 UI 是否需要提供“允许写入长期记忆”的显式开关，还是首版只允许通过任务描述中的明确指令触发？
- 记忆面板 notes 文件很多时是否需要在本次一起做分页，还是保留列表元数据全量返回？
