## MODIFIED Requirements

### Requirement: Tools
系统 SHALL 提供 `memory_write`、`memory_read`、`memory_search` 三个工具替代原有的 `save_memory` / `update_memory`。

- `memory_write(path, content)`：将 content 写入 `{userData}/memory/{path}`。path SHALL 为相对路径，仅允许 `.md` 扩展名。写入前对 content 做基础 sanitization：去除 ASCII 控制字符（0x00-0x1F，保留 `\n` 和 `\t`）。
- `memory_read(path)`：读取 `{userData}/memory/{path}` 文件内容。path 为 `"."` 时返回目录列表。
- `memory_search(query)`：对所有记忆文件执行语义搜索（有 embedding model 时）或关键词搜索（fallback），返回 top-K 相关片段。

#### Scenario: memory_write 写入长期记忆
- **WHEN** LLM 调用 `memory_write` 工具，path 为 `MEMORY.md`，content 为 Markdown 文本
- **THEN** 系统 SHALL 将内容写入 `{userData}/memory/MEMORY.md`，文件不存在时自动创建

#### Scenario: memory_write 写入每日笔记
- **WHEN** LLM 调用 `memory_write` 工具，path 为 `memory/2026-04-15.md`
- **THEN** 系统 SHALL 将内容写入对应文件，父目录不存在时自动创建

#### Scenario: memory_read 读取文件
- **WHEN** LLM 调用 `memory_read` 工具，path 为 `MEMORY.md`
- **THEN** 系统 SHALL 返回文件完整内容，文件不存在时返回空字符串

#### Scenario: memory_search 语义搜索
- **WHEN** LLM 调用 `memory_search` 工具，query 为自然语言描述
- **THEN** 系统 SHALL 返回相关记忆片段列表，每个包含文件路径、匹配片段和相关度分数

### Requirement: Memory Injection
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

### Requirement: System Prompt Guidance
`_build_system_prompt` 的默认提示词中记忆使用规则 SHALL 更新为引导 LLM 使用 `memory_write`/`memory_read` 工具。

```
## 记忆使用规则
你可以通过工具管理你的记忆文件：
- memory_write: 写入记忆文件。MEMORY.md 存储长期事实和偏好，memory/YYYY-MM-DD.md 存储每日笔记。
- memory_read: 读取记忆文件内容。
- memory_search: 搜索所有记忆文件。

何时主动写入记忆：
- 用户明确要求"记住..."、"下次..."
- 用户透露持久性偏好（语言、格式、工具选择等）
- 用户提到关于自己的重要长期事实（职业、项目、习惯等）
- 用户纠正之前的错误时，更新 MEMORY.md 对应内容

不要写入记忆的内容：
- 当前任务的临时细节
- 本次对话专属的上下文
- 大段代码或文件内容
```

#### Scenario: 默认模式记忆指引
- **WHEN** 非 Skill 模式构建 system prompt
- **THEN** system prompt SHALL 包含上述记忆使用规则段落

### Requirement: Memory Refresh (Pre-Compaction)
`_memory_refresh` SHALL 使用 `memory_write` 工具替代 `save_memory`，引导 LLM 将重要信息写入 Markdown 文件。

#### Scenario: Compaction 前记忆刷新
- **WHEN** `total_tokens > context_limit * COMPRESS_RATIO` 触发 compaction
- **THEN** 系统 SHALL 先执行 `_memory_refresh`，静默请求 LLM 调用 `memory_write` 保存重要信息

## REMOVED Requirements

### Requirement: save_memory server tool
**Reason**: 被 `memory_write` 替代，不再需要 DB 写入
**Migration**: 使用 `memory_write` 工具写入 Markdown 文件

### Requirement: update_memory server tool
**Reason**: 被 `memory_write` 和 `memory_read` 组合替代
**Migration**: LLM 先 `memory_read` 读取现有内容，再 `memory_write` 写入更新后的内容
