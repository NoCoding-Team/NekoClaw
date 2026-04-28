## MODIFIED Requirements

### Requirement: 内置 Skill 对新用户的初始启用状态由 frontmatter 决定
`ensure_user_skill_configs` 在为新用户初始化 SkillConfig 时，SHALL 读取内置 Skill 的 SKILL.md frontmatter 中的 `default_enabled` 字段作为初始 `enabled` 值。若字段不存在则默认 `true`。

#### Scenario: 新用户注册后内置 Skill 按默认值初始化
- **WHEN** 新用户首次请求 Skills 列表，触发 `ensure_user_skill_configs`
- **THEN** 系统为每个内置 Skill 创建 SkillConfig，`enabled` 值取自该 Skill 的 `default_enabled` frontmatter 字段（缺失时默认 true）

#### Scenario: 用户可覆盖默认开关
- **WHEN** 用户在客户端手动切换某 Skill 的开关
- **THEN** 用户的 SkillConfig 记录被更新，与 frontmatter 中的 default_enabled 无关
