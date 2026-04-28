## Requirements

### Requirement: 工具需求自动推断
系统 SHALL 提供工具推断 API，根据任务描述通过 LLM 分析并返回建议的 `allowed_tools` 列表和匹配的 `skill_id`。

#### Scenario: 成功推断任务所需工具
- **WHEN** 前端调用 `POST /api/scheduled-tasks/infer-tools`，传入任务描述
- **THEN** 系统 SHALL 组装可用工具列表和技能目录，调用 LLM 分析，返回 `{ allowed_tools: list[str], skill_id: str | null, reasoning: str }`

#### Scenario: 明确需要网络工具的任务
- **WHEN** 任务描述包含"天气"、"查询"、"搜索"、"获取"等语义
- **THEN** 推断结果 SHALL 包含对应的网络相关工具（如 `web_search` 或 `http_request`）

#### Scenario: 匹配已有技能
- **WHEN** 任务描述语义与某个技能的 `triggers` 关键字高度匹配
- **THEN** 推断结果 SHALL 返回对应的 `skill_id`，并将技能 `requires_tools` 自动包含进 `allowed_tools`

#### Scenario: LLM 不可用时的降级
- **WHEN** 推断 API 调用时无可用 LLM 配置或 LLM 调用失败
- **THEN** 系统 SHALL 返回 HTTP 422，前端展示"工具推断失败，请手动配置"提示

### Requirement: 创建时工具推断 UI 入口
系统 SHALL 在定时任务创建/编辑表单中提供"分析工具"按钮，调用推断 API 并自动填充配置。

#### Scenario: 点击分析工具后自动填充
- **WHEN** 用户在任务创建/编辑表单中输入任务描述后点击"分析工具"
- **THEN** 前端调用推断 API，将返回的 `allowed_tools` 和 `skill_id` 填入对应表单字段，并展示 `reasoning` 说明

#### Scenario: 填充后用户可修改
- **WHEN** 推断结果填入表单字段后
- **THEN** 用户 SHALL 能够手动调整 `allowed_tools` 或 `skill_id`，推断结果仅为建议

#### Scenario: 任务描述为空时按钮禁用
- **WHEN** 任务描述字段为空
- **THEN** "分析工具"按钮 SHALL 处于禁用状态
