## MODIFIED Requirements

### 记忆注入上下文
每次对话开始时，系统 SHALL 读取长期记忆，并 SHALL 仅在用户问题或 query_hint 需要时按需检索或读取 `notes/` 子目录下的每日笔记。

#### Scenario: 默认不读取今日笔记全文
- **WHEN** `_load_memory` 构建正常对话的记忆上下文
- **THEN** 系统 MUST NOT 默认读取 `{user_dir}/notes/{today}.md` 的全文注入 system prompt

#### Scenario: 默认不读取昨日笔记全文
- **WHEN** `_load_memory` 构建正常对话的记忆上下文
- **THEN** 系统 MUST NOT 默认读取 `{user_dir}/notes/{yesterday}.md` 的全文注入 system prompt

#### Scenario: 按需检索每日笔记
- **WHEN** 用户问题涉及今日、昨日、最近记录或某个历史主题
- **THEN** 系统 SHALL 通过记忆检索返回相关 daily note 片段，而不是注入完整文件

#### Scenario: 笔记文件不存在时
- **WHEN** 需要检索或读取的每日笔记文件不存在
- **THEN** 系统 SHALL 跳过该文件，不报错

## ADDED Requirements

### Requirement: 记忆工具使用边界
系统 SHALL 明确区分 `search_memory`、`memory_read` 和 `memory_write` 的适用场景。

#### Scenario: 查询历史记忆使用 search_memory
- **WHEN** 用户询问过去是否提到某事、最近记录、历史偏好或某个主题
- **THEN** Agent SHALL 优先使用 `search_memory` 检索相关记忆和每日笔记片段

#### Scenario: 明确读取文件使用 memory_read
- **WHEN** 用户明确要求查看 `MEMORY.md`、`USER.md`、`notes/YYYY-MM-DD.md` 或其他具体记忆文件
- **THEN** Agent SHALL 使用 `memory_read` 读取该文件

#### Scenario: 写入前读取目标文件
- **WHEN** Agent 需要更新已有记忆文件
- **THEN** Agent SHALL 先使用 `memory_read` 读取目标文件当前内容，再使用 `memory_write` 写回整合后的完整内容

#### Scenario: 保存长期信息使用 memory_write
- **WHEN** 用户明确要求记住信息，或对话中出现需要长期保存的偏好、关键事实或重要决策
- **THEN** Agent SHALL 使用 `memory_write` 写回对应记忆文件
