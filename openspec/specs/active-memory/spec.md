# active-memory

LLM 主动记忆能力——模仿 OpenClaw `memory_get` / `memory_search` 的工具驱动记忆机制。

---

## Overview

让 LLM 在对话中主动识别值得长期记住的信息，并通过工具调用将其写入记忆库。上下文压缩前自动触发 memory refresh，防止重要上下文因 compaction 丢失。记忆在每次对话开始时注入 system prompt，跨会话持久生效。

---

## Requirements

### Tools

系统 SHALL 提供 `memory_write`、`memory_read`、`memory_search` 三个工具替代原有的 `save_memory` / `update_memory`。

- `memory_write(path, content)`：将 content 写入 `{userData}/memory/{path}`。path SHALL 为相对路径，仅允许 `.md` 扩展名。写入前对 content 做基础 sanitization：去除 ASCII 控制字符（0x00-0x1F，保留 `\n` 和 `\t`）。
- `memory_read(path)`：读取 `{userData}/memory/{path}` 文件内容。path 为 `"."` 时返回目录列表。
- `memory_search(query)`：对所有记忆文件执行语义搜索（有 embedding model 时）或关键词搜索（fallback），返回 top-K 相关片段。

#### Scenario: memory_write 写入长期记忆
- **WHEN** LLM 调用 `memory_write` 工具，path 为 `MEMORY.md`，content 为 Markdown 文本
- **THEN** 系统 SHALL 将内容写入 `{userData}/memory/MEMORY.md`，文件不存在时自动创建

#### Scenario: memory_write 写入每日笔记
- **WHEN** LLM 调用 `memory_write` 工具，path 为 `memory/YYYY-MM-DD.md`
- **THEN** 系统 SHALL 将内容写入对应文件，父目录不存在时自动创建

#### Scenario: memory_read 读取文件
- **WHEN** LLM 调用 `memory_read` 工具，path 为 `MEMORY.md`
- **THEN** 系统 SHALL 返回文件完整内容，文件不存在时返回空字符串

#### Scenario: memory_search 语义搜索
- **WHEN** LLM 调用 `memory_search` 工具，query 为自然语言描述
- **THEN** 系统 SHALL 返回相关记忆片段列表，每个包含文件路径、匹配片段和相关度分数

### Memory Injection

每次对话开始时，系统 SHALL 读取 Markdown 记忆文件并注入 system prompt，替代原有 DB SELECT + 拼接逻辑。

- 读取 `MEMORY.md` 全文（截断至 4000 token 上限）
- 读取今天和昨天的 `memory/YYYY-MM-DD.md`
- 拼接为 `## 长期记忆\n{MEMORY.md 内容}\n## 近期笔记\n{daily notes 内容}` 注入 system prompt

#### Scenario: Mode B 记忆注入
- **WHEN** `useLocalLLM.sendMessage` 构建消息列表
- **THEN** system prompt SHALL 包含从本地 Markdown 文件读取的记忆内容

#### Scenario: Mode A 记忆注入
- **WHEN** 后端 `_build_system_prompt` 构建系统提示
- **THEN** system prompt SHALL 包含从服务端存储的 Markdown 文件读取的记忆内容

#### Scenario: 记忆文件不存在时
- **WHEN** `MEMORY.md` 或当天每日笔记文件不存在
- **THEN** 系统 SHALL 跳过该文件的注入，不报错

### System Prompt Guidance

`_build_system_prompt` 的默认提示词中记忆使用规则 SHALL 采用主动引导策略，明确区分 MEMORY.md 和每日笔记的使用场景。

#### Scenario: 默认模式记忆指引
- **WHEN** 非 Skill 模式构建 system prompt
- **THEN** system prompt SHALL 包含主动引导的记忆使用规则，明确以下行为：
  - 发现用户偏好、重要事实、关键决策时 SHALL 调用 `memory_write` 写入 MEMORY.md
  - 对话产生有价值的要点、结论时 SHALL 调用 `memory_write` 写入当日 YYYY-MM-DD.md
  - 写入前 SHALL 先 `memory_read` 读取已有内容，追加而非覆写
  - 不 SHALL 包含"每轮最多 N 次"的调用频率限制

#### Scenario: 前后端引导一致
- **WHEN** 前端 `MEMORY_GUIDANCE` 和后端 `_TOOL_RULES` 分别构建记忆引导文本
- **THEN** 两端 SHALL 使用语义一致的记忆引导策略（措辞可根据上下文微调，但规则含义相同）

### Memory Refresh (Pre-Compaction)

`_memory_refresh` SHALL 同时引导 LLM 维护 MEMORY.md 和当日每日笔记，且不受每 session 仅一次的限制。

#### Scenario: Compaction 前记忆刷新
- **WHEN** `total_tokens > context_limit * COMPRESS_RATIO` 触发 compaction
- **THEN** 系统 SHALL 先执行 `_memory_refresh`，静默请求 LLM 调用 `memory_write` 保存重要信息

#### Scenario: Mode B 前端 Memory Refresh
- **WHEN** 前端 Mode B 检测到上下文超过 70% 阈值即将触发 Compaction
- **THEN** 系统 SHALL 执行一轮静默 LLM 调用，提示词引导 LLM 检查最近对话并用 `memory_write` 工具将重要信息保存到 MEMORY.md 或每日笔记

#### Scenario: Refresh Prompt 同时维护两类记忆
- **WHEN** Memory Refresh 执行时
- **THEN** 发给 LLM 的 prompt SHALL 引导 LLM：
  1. 先 `memory_read("MEMORY.md")` 和 `memory_read("YYYY-MM-DD.md")` 读取已有内容
  2. 向 MEMORY.md 追加/更新长期关键信息（用户偏好、重要事实、关键决策）
  3. 向当日笔记追加对话要点、讨论话题、结论

#### Scenario: 不再限制每会话一次
- **WHEN** 当前会话已经执行过 Memory Refresh
- **THEN** 系统 SHALL 仍允许后续 Memory Refresh 执行（受最小轮次间隔保护约束）

#### Scenario: Memory Refresh 静默执行
- **WHEN** Memory Refresh 执行过程中
- **THEN** 系统 SHALL NOT 向用户 UI 发送可见消息，不在聊天气泡中显示 Memory Refresh 的中间过程

---

## Out of Scope

- Dreaming sweep（后台记忆提炼，可选实验性功能，后续迭代）
- 记忆去重 / 合并逻辑（当前靠 LLM 自主判断是否重复）
- Skill 模式下的自动记忆注入规则
