## ADDED Requirements

### Requirement: 工具分类元数据
每个工具定义 SHALL 包含 `category` 字符串字段，值为以下枚举之一：`internal`、`memory`、`file`、`execution`、`network`、`browser`。

#### Scenario: 工具定义包含 category
- **WHEN** `TOOL_DEFINITIONS` 中定义一个工具
- **THEN** 该工具 MUST 包含 `category` 字段，且值为上述枚举之一

#### Scenario: category 分配正确性
- **WHEN** 系统启动加载工具定义
- **THEN** 工具 category 分配 SHALL 为：`read_skill` → `internal`；`search_memory`/`memory_read`/`memory_write` → `memory`；`file_read`/`file_write`/`file_list`/`file_delete` → `file`；`python_repl`/`shell_exec` → `execution`；`web_search`/`http_request` → `network`；`browser_navigate`/`browser_screenshot`/`browser_click`/`browser_type` → `browser`

### Requirement: System prompt 按分类分组展示工具
系统 SHALL 在构建 system prompt 时，将工具描述按 `category` 分组，每组以中文标题开头。

#### Scenario: 分组展示格式
- **WHEN** `build_system_prompt()` 生成工具描述段落
- **THEN** 输出 SHALL 按 category 分组，每组格式为 `## <分类中文标题>`，其下列出该组工具的名称和描述

#### Scenario: internal 分类不展示
- **WHEN** 工具 category 为 `internal`
- **THEN** 该工具 SHALL 不出现在分组展示中，保持现有的独立注入方式
