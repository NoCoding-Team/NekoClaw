## ADDED Requirements

### Requirement: 管理员可上传内置 Skill
系统 SHALL 允许管理员上传新的内置 Skill（ZIP 包或单个 SKILL.md），上传后对所有用户可见。

#### Scenario: 上传有效的 Skill ZIP 包
- **WHEN** 管理员 POST `/api/admin/skills` 上传包含 SKILL.md 的 ZIP 文件
- **THEN** 系统解压到 builtin skills 目录，刷新 skills 快照，返回新 Skill 信息

#### Scenario: 上传格式无效时报错
- **WHEN** 管理员上传的 ZIP 包中不包含 SKILL.md
- **THEN** 系统返回 422 Unprocessable Entity

### Requirement: 管理员可设置内置 Skill 的新用户默认开关
系统 SHALL 允许管理员控制某个内置 Skill 在新用户注册时是否默认启用。

#### Scenario: 设置 Skill 默认关闭
- **WHEN** 管理员 PATCH `/api/admin/skills/{name}` 设置 default_enabled=false
- **THEN** 系统更新该 Skill 的 SKILL.md frontmatter 中 default_enabled 字段，后续新注册用户的该 Skill 初始状态为关闭

#### Scenario: 已注册用户不受影响
- **WHEN** 管理员修改 Skill 的 default_enabled
- **THEN** 已有用户的 SkillConfig 记录不变（only 影响新用户）

### Requirement: 管理员可删除内置 Skill
系统 SHALL 允许管理员删除内置 Skill，删除后该 Skill 从所有用户的列表中消失。

#### Scenario: 删除内置 Skill
- **WHEN** 管理员 DELETE `/api/admin/skills/{name}`
- **THEN** 系统从 builtin 目录删除该 Skill 文件夹，刷新快照，并清理所有用户的相关 SkillConfig 记录

### Requirement: 管理员可查看内置 Skill 列表
系统 SHALL 提供内置 Skill 列表接口，包含每个 Skill 的名称、描述、默认开关状态。

#### Scenario: 获取内置 Skill 列表
- **WHEN** 管理员 GET `/api/admin/skills`
- **THEN** 系统返回所有 source="builtin" 的 Skill 列表，包含 name、description、default_enabled 字段
