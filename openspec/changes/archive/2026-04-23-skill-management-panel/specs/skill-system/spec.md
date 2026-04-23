## MODIFIED Requirements

### Requirement: Skill 加载与注入
系统 SHALL 在构建系统提示时，根据当前用户的 skills_config 启用状态过滤可用技能，只注入 enabled=true 的技能到 `<available_skills>` 列表。技能来源包括内置目录（`backend/skills/`）和用户目录（`data/skills/{user_id}/`）。

#### Scenario: 只注入启用的技能
- **WHEN** 构建系统提示时用户有 3 个技能（2 个 enabled，1 个 disabled）
- **THEN** `<available_skills>` 中 SHALL 只包含 2 个 enabled 的技能

#### Scenario: 合并内置和用户技能
- **WHEN** 扫描技能时，内置目录有 4 个技能，用户目录有 2 个技能
- **THEN** 系统 SHALL 返回 6 个技能的合并列表（假设无同名冲突）

### Requirement: read_skill 工具支持用户技能
`read_skill` 工具 SHALL 接收 user_id 上下文，按内置目录优先、用户目录其次的顺序查找技能文件。

#### Scenario: 读取内置技能
- **WHEN** Agent 调用 `read_skill(skill="get-weather")`，且 `backend/skills/get-weather/` 存在
- **THEN** 系统 SHALL 返回内置目录中的 SKILL.md 内容

#### Scenario: 读取用户安装的技能
- **WHEN** Agent 调用 `read_skill(skill="gmail")`，且仅在用户目录 `data/skills/{user_id}/gmail/` 存在
- **THEN** 系统 SHALL 返回用户目录中的 SKILL.md 内容

#### Scenario: 内置优先于用户同名技能
- **WHEN** 内置目录和用户目录同时存在同名技能
- **THEN** 系统 SHALL 返回内置目录中的版本
