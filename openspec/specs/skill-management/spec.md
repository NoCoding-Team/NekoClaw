### Requirement: 技能启用状态持久化
系统 SHALL 在数据库中存储每个用户对每个技能的启用/禁用状态，使用 `skills_config` 表，复合主键为 `(user_id, skill_name)`。

#### Scenario: 用户切换技能开关
- **WHEN** 用户在技能库面板切换某个技能的开关
- **THEN** 系统 SHALL 更新 `skills_config` 表中对应记录的 `enabled` 字段，并在后续对话中只注入 enabled=true 的技能

#### Scenario: 首次访问技能列表
- **WHEN** 用户首次调用 `GET /api/skills` 且 DB 中该用户无任何 skills_config 记录
- **THEN** 系统 SHALL 自动为所有内置技能创建记录（enabled=true, source="builtin"），并返回完整列表

#### Scenario: 新增内置技能自动补充
- **WHEN** 系统新增了内置技能（backend/skills/ 中出现新目录），而用户的 DB 记录中无该技能
- **THEN** 系统 SHALL 自动为该用户补充缺失的内置技能记录（enabled=true）

### Requirement: 用户技能文件隔离存储
系统 SHALL 将用户安装的技能文件存储在 `{SKILLS_FILES_DIR}/{user_id}/{skill_name}/` 目录下，不同用户之间互不可见。

#### Scenario: 用户 A 安装技能
- **WHEN** 用户 A 通过 API 安装名为 "gmail" 的技能
- **THEN** 技能文件 SHALL 存储在 `data/skills/{user_A_id}/gmail/` 目录下

#### Scenario: 用户 B 看不到用户 A 的技能
- **WHEN** 用户 B 调用 `GET /api/skills`
- **THEN** 返回列表 SHALL 不包含用户 A 安装的 "gmail" 技能

### Requirement: 技能安装
系统 SHALL 允许用户通过上传 ZIP 压缩包或文件夹来安装自定义技能。

#### Scenario: 上传 ZIP 安装技能
- **WHEN** 用户上传一个包含 SKILL.md 的 ZIP 文件到 `POST /api/skills/install`
- **THEN** 系统 SHALL 解压文件到用户技能目录，解析 SKILL.md 的 frontmatter，在 DB 中创建 enabled=true 的记录，并返回技能元数据

#### Scenario: 同名冲突检测
- **WHEN** 用户尝试安装与现有内置技能或已安装用户技能同名的技能
- **THEN** 系统 SHALL 拒绝安装并返回错误信息

#### Scenario: 缺少 SKILL.md
- **WHEN** 上传的文件中不包含 SKILL.md
- **THEN** 系统 SHALL 拒绝安装并返回错误信息

### Requirement: 技能删除
系统 SHALL 允许用户删除自己安装的技能，但禁止删除内置技能。

#### Scenario: 删除用户技能
- **WHEN** 用户请求删除 source="user" 的技能
- **THEN** 系统 SHALL 删除 `data/skills/{user_id}/{skill_name}/` 目录和 DB 中对应记录

#### Scenario: 删除内置技能被拒绝
- **WHEN** 用户请求删除 source="builtin" 的技能
- **THEN** 系统 SHALL 返回 403 错误，提示内置技能不可删除

### Requirement: 技能列表 API
系统 SHALL 提供 `GET /api/skills` 端点，返回当前用户可见的所有技能（内置 + 用户安装）及其启用状态。

#### Scenario: 返回完整技能列表
- **WHEN** 用户调用 `GET /api/skills`
- **THEN** 系统 SHALL 返回数组，每个元素包含 name、description、version、author、source（"builtin" 或 "user"）、enabled 字段

### Requirement: 技能库前端面板
系统 SHALL 在前端侧边栏提供「技能库」面板，以卡片网格形式展示所有可用技能。

#### Scenario: 展示技能卡片
- **WHEN** 用户打开技能库面板
- **THEN** 面板 SHALL 以卡片网格展示所有技能，每张卡片包含技能名称、描述、版本号、来源标签（内置/用户）、启用开关

#### Scenario: 内置技能卡片无删除按钮
- **WHEN** 技能库面板展示内置技能卡片
- **THEN** 卡片 SHALL 不显示删除按钮

#### Scenario: 用户技能卡片有删除按钮
- **WHEN** 技能库面板展示用户安装的技能卡片
- **THEN** 卡片 SHALL 显示删除按钮

#### Scenario: 安装技能入口
- **WHEN** 用户点击面板中的安装按钮
- **THEN** 系统 SHALL 打开文件选择器，允许用户选择文件夹或 ZIP 文件进行上传安装
