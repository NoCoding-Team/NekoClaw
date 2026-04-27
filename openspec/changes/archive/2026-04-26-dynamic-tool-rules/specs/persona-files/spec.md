## MODIFIED Requirements

### Requirement: 人设文件注入 System Prompt
`build_system_prompt` SHALL 按固定顺序加载人设文件并拼接到 system prompt 中。

#### Scenario: 完整 system prompt 拼接顺序
- **WHEN** `build_system_prompt` 构建系统提示
- **THEN** system prompt SHALL 按以下顺序拼接：SOUL.md 内容 → USER.md 内容 → AGENTS.md 内容 → 工具声明（`_build_tool_rules(allowed_tools)` 动态生成的工具列表和执行环境部分） → Skills 目录和规则 → 记忆注入（MEMORY.md + 日报）

#### Scenario: SOUL.md 替代硬编码人设
- **WHEN** SOUL.md 存在且有内容
- **THEN** system prompt SHALL 使用 SOUL.md 内容作为人格定义，不再使用 `_DEFAULT_PERSONA` 硬编码字符串

#### Scenario: 单个文件超长截断
- **WHEN** 任一人设文件内容超过 4000 字符
- **THEN** 系统 SHALL 截断该文件内容至 4000 字符并附加 `\n...(已截断)` 标记

## ADDED Requirements

### Requirement: 工具规则按 allowed_tools 动态生成
`build_system_prompt` SHALL 通过 `_build_tool_rules(allowed_tools)` 函数动态生成工具执行环境说明，只描述实际启用的工具组。

#### Scenario: 已关闭工具不出现在工具规则中
- **WHEN** `allowed_tools` 不包含 `web_search`
- **THEN** 生成的工具规则 SHALL 不包含网络搜索工具的任何描述

#### Scenario: 已启用工具出现在工具规则中
- **WHEN** `allowed_tools` 包含 `shell_exec`
- **THEN** 生成的工具规则 SHALL 包含命令行执行工具的执行环境描述

#### Scenario: allowed_tools 为 None 时全量注入
- **WHEN** `allowed_tools` 为 `None`（全量模式）
- **THEN** 生成的工具规则 SHALL 包含所有工具组的描述，行为与原 `_TOOL_RULES` 常量完全一致

#### Scenario: 记忆工具始终注入
- **WHEN** `allowed_tools` 为任意值（包括空列表）
- **THEN** 生成的工具规则 SHALL 始终包含 `memory_read`、`memory_write`、`search_memory` 的描述
