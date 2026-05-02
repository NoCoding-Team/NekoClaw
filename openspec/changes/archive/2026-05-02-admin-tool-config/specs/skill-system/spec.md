## ADDED Requirements

### Requirement: 全局工具状态影响技能可用性
技能可用性判断 SHALL 考虑全局工具状态——如果技能的 `requires_tools` 中有工具被 Admin 全局禁用，该技能 SHALL 视为不可用。

#### Scenario: 依赖工具被全局禁用
- **WHEN** 技能 `get-weather` 的 `requires_tools` 包含 `http_request`，且 Admin 已全局禁用 `http_request`
- **THEN** 系统 SHALL 不将 `get-weather` 注入到 `<available_skills>` 列表中

#### Scenario: 依赖工具全部启用
- **WHEN** 技能的 `requires_tools` 中所有工具均为全局启用状态
- **THEN** 系统 SHALL 正常判断技能可用性（继续检查用户级 skills_config）

#### Scenario: 无 requires_tools 的技能
- **WHEN** 技能未声明 `requires_tools`
- **THEN** 全局工具状态 SHALL 不影响该技能的可用性
