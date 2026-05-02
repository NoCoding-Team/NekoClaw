## ADDED Requirements

### Requirement: Skill 定义模型
系统 SHALL 支持 Skill 作为一组「系统提示 + 工具白名单 + 沙盒级别」的预设配置，可在对话时选择激活。

#### Scenario: Skill 数据结构
- **WHEN** 创建或查询 Skill
- **THEN** Skill 对象 SHALL 包含：id、name、icon、system_prompt、allowed_tools（数组）、sandbox_level（LOW/MEDIUM/HIGH）、is_builtin、owner_id

#### Scenario: 内置 Skill
- **WHEN** 服务端初始化
- **THEN** 系统 SHALL 预置至少 3 个内置 Skill：「通用助手」「代码助手」「文件管家」，`is_builtin=true`，不可删除

### Requirement: Skill 管理
系统 SHALL 允许用户创建、编辑、删除自定义 Skill，并选择存储于云端或本地。

#### Scenario: 创建自定义 Skill
- **WHEN** 用户在技能库界面填写 Skill 信息并保存
- **THEN** 系统创建 Skill 记录，`is_builtin=false`，`owner_id` 关联当前用户

#### Scenario: 删除内置 Skill
- **WHEN** 用户尝试删除内置 Skill
- **THEN** 系统 SHALL 拒绝操作，提示「内置技能不可删除」

#### Scenario: 本地存储 Skill
- **WHEN** 用户选择「仅本地存储」创建 Skill
- **THEN** Skill 存储于 PC 端本地 JSON 文件，不同步到服务端，其他设备不可见

### Requirement: Skill 激活与切换
系统 SHALL 允许用户在对话过程中随时切换激活的 Skill。

#### Scenario: 选择 Skill 开始对话
- **WHEN** 用户在输入框旁的 Skill 选择器中选择一个 Skill
- **THEN** 后续对话 SHALL 使用该 Skill 的系统提示，且工具调用限制在 allowed_tools 范围内

#### Scenario: Skill 工具白名单执行
- **WHEN** LLM 尝试调用不在当前 Skill 的 allowed_tools 中的工具
- **THEN** 系统 SHALL 拒绝该工具调用，并告知 LLM 该工具在当前 Skill 下不可用

#### Scenario: 默认 Skill
- **WHEN** 用户未选择任何 Skill 开始对话
- **THEN** 系统使用「通用助手」内置 Skill

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

## MODIFIED Requirements

### Requirement: 内置 Skill 对新用户的初始启用状态由 frontmatter 决定
`ensure_user_skill_configs` 在为新用户初始化 SkillConfig 时，SHALL 读取内置 Skill 的 SKILL.md frontmatter 中的 `default_enabled` 字段作为初始 `enabled` 值。若字段不存在则默认 `true`。

#### Scenario: 新用户注册后内置 Skill 按默认值初始化
- **WHEN** 新用户首次请求 Skills 列表，触发 `ensure_user_skill_configs`
- **THEN** 系统为每个内置 Skill 创建 SkillConfig，`enabled` 值取自该 Skill 的 `default_enabled` frontmatter 字段（缺失时默认 true）

#### Scenario: 用户可覆盖默认开关
- **WHEN** 用户在客户端手动切换某 Skill 的开关
- **THEN** 用户的 SkillConfig 记录被更新，与 frontmatter 中的 default_enabled 无关

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
