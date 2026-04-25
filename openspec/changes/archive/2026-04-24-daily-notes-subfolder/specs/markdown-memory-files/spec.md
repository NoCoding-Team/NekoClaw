## MODIFIED Requirements

### Requirement: Markdown 记忆文件存储
系统 SHALL 以 Markdown 文件作为记忆载体，存储于 `{userData}/memory/` 目录下。`MEMORY.md` 为长期记忆文件，`notes/YYYY-MM-DD.md` 为每日笔记文件。

#### Scenario: 长期记忆文件位置不变
- **WHEN** 调用 `memory_write` 写入 `MEMORY.md`
- **THEN** 系统 SHALL 将内容写入 `{userData}/memory/{user_id}/MEMORY.md`（根目录，不变）

#### Scenario: 每日笔记文件创建于 notes/ 子目录
- **WHEN** 调用 `memory_write` 写入每日笔记
- **THEN** 系统 SHALL 将内容写入 `{userData}/memory/{user_id}/notes/YYYY-MM-DD.md`，`notes/` 目录不存在时自动创建

### Requirement: 记忆注入上下文
每次对话开始时，系统 SHALL 读取 `notes/` 子目录下的今日和昨日笔记注入 system prompt。

#### Scenario: 读取今日笔记
- **WHEN** `_load_memory` 构建记忆上下文
- **THEN** 系统 SHALL 读取 `{user_dir}/notes/{today}.md` 的内容（而非 `{user_dir}/{today}.md`）

#### Scenario: 读取昨日笔记
- **WHEN** `_load_memory` 构建记忆上下文
- **THEN** 系统 SHALL 读取 `{user_dir}/notes/{yesterday}.md` 的内容

#### Scenario: 笔记文件不存在时
- **WHEN** 今日或昨日笔记文件不存在
- **THEN** 系统 SHALL 跳过该文件的注入，不报错
