## ADDED Requirements

### Requirement: 每日笔记按需检索注入
系统 SHALL 不再默认将每日笔记全文注入正常对话 system prompt，而是根据用户问题和 query_hint 按需检索相关片段。

#### Scenario: 正常对话不注入每日笔记全文
- **WHEN** 系统为正常对话构建 system prompt
- **THEN** 系统 MUST NOT 默认拼接今日或昨日每日笔记全文

#### Scenario: 用户询问近期记录时检索笔记
- **WHEN** 用户询问今天、昨天、最近或某个主题的历史记录
- **THEN** 系统 SHALL 使用 query_hint 检索 MEMORY.md 和 daily notes 的相关片段后注入上下文

#### Scenario: 无相关笔记片段时跳过
- **WHEN** daily notes 检索没有返回相关片段
- **THEN** 系统 SHALL 跳过每日笔记注入，而不是回退到全文注入

#### Scenario: 明确指定日期时可读取文件
- **WHEN** 用户明确要求查看某一天的笔记或指定 `notes/YYYY-MM-DD.md`
- **THEN** Agent SHALL 使用 `memory_read` 读取对应文件内容
