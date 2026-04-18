## ADDED Requirements

### Requirement: SKILL.md 文件格式
系统 SHALL 以 Markdown 文件（SKILL.md）作为 Agent Skill 的定义载体，每个 Skill 对应 `backend/skills/<name>/SKILL.md`。

#### Scenario: SKILL.md 结构
- **WHEN** 创建或读取一个 SKILL.md
- **THEN** 文件 SHALL 包含 YAML Frontmatter（`name`、`description`、`triggers` 数组、`requires_tools` 数组、`author`、`version`）和 Markdown Body（自然语言操作步骤）

#### Scenario: name 字段唯一性
- **WHEN** 多个 SKILL.md 的 Frontmatter 中 `name` 字段重复
- **THEN** 加载器 SHALL 报告警告并只保留最先扫描到的那个

#### Scenario: requires_tools 校验
- **WHEN** SKILL.md 的 `requires_tools` 中包含不存在于 TOOL_DEFINITIONS 中的工具名
- **THEN** 加载器 SHALL 将该 Skill 标记为 disabled 并记录警告日志，不注入到可用技能列表

### Requirement: 技能加载与缓存
系统 SHALL 在应用启动时扫描 `backend/skills/` 目录下所有子目录的 SKILL.md，解析 YAML Frontmatter 并缓存到模块级变量中。

#### Scenario: 启动扫描
- **WHEN** 应用启动（`on_startup` 生命周期）
- **THEN** 系统 SHALL 遍历 `backend/skills/` 下每个包含 `SKILL.md` 的子目录，解析 Frontmatter 元数据，构建 `list[SkillMeta]` 缓存

#### Scenario: 无 SKILL.md 的子目录
- **WHEN** `backend/skills/` 下某个子目录不包含 `SKILL.md`
- **THEN** 系统 SHALL 跳过该子目录，不报错

#### Scenario: Frontmatter 解析失败
- **WHEN** 某个 SKILL.md 的 YAML Frontmatter 格式错误
- **THEN** 系统 SHALL 记录警告日志并跳过该 Skill，不影响其他 Skill 加载

### Requirement: 可用技能快照注入
系统 SHALL 在每次构建 System Prompt 时，根据用户当前 `allowed_tools` 动态生成可用技能列表并注入。

#### Scenario: 动态过滤
- **WHEN** 构建 System Prompt，用户的 `allowed_tools` 为 `["fetch_url", "web_search"]`
- **THEN** 系统 SHALL 只注入 `requires_tools` 是 `["fetch_url", "web_search"]` 子集的 Skill 到 `<available_skills>` 块中

#### Scenario: allowed_tools 为 None
- **WHEN** `allowed_tools` 为 None（表示全部工具启用）
- **THEN** 系统 SHALL 注入所有未被 disabled 的 Skill

#### Scenario: 快照格式
- **WHEN** 注入可用技能列表
- **THEN** 系统 SHALL 使用 XML 标签格式，每个 Skill 包含 `<name>`、`<description>`、`<triggers>` 子元素

### Requirement: 技能系统使用规则
系统 SHALL 在 System Prompt 中注入技能系统的使用规则，指导 Agent 如何发现和使用技能。

#### Scenario: 规则内容
- **WHEN** System Prompt 中注入技能规则
- **THEN** 规则 SHALL 包含：① 当用户请求匹配技能时先调用 `read_skill` 读取说明 ② 按说明步骤调用核心工具 ③ 不匹配时正常自由回答

#### Scenario: 规则优先级
- **WHEN** 技能规则与默认行为冲突
- **THEN** Agent SHALL 优先遵循技能文档中的操作步骤

### Requirement: read_skill 服务端工具
系统 SHALL 提供 `read_skill` 服务端工具，允许 Agent 读取指定技能的 SKILL.md 及其附属资源文件。

#### Scenario: 读取 SKILL.md
- **WHEN** Agent 调用 `read_skill(skill="get-weather")`
- **THEN** 系统 SHALL 返回 `backend/skills/get-weather/SKILL.md` 的完整文本内容

#### Scenario: 读取附属资源
- **WHEN** Agent 调用 `read_skill(skill="chart-analysis", file="templates/bar.py")`
- **THEN** 系统 SHALL 返回 `backend/skills/chart-analysis/templates/bar.py` 的完整文本内容

#### Scenario: 技能名称安全校验
- **WHEN** `skill` 参数包含非 `[a-z0-9_-]` 字符
- **THEN** 系统 SHALL 拒绝请求并返回错误信息

#### Scenario: 路径遍历防护
- **WHEN** `file` 参数包含 `..` 路径段
- **THEN** 系统 SHALL 拒绝请求并返回错误信息

#### Scenario: 路径越界防护
- **WHEN** 规范化后的文件绝对路径不在 `backend/skills/<name>/` 目录下
- **THEN** 系统 SHALL 拒绝请求并返回错误信息

#### Scenario: 文件不存在
- **WHEN** 请求的技能或文件不存在
- **THEN** 系统 SHALL 返回错误信息 "Skill '<name>' not found" 或 "File '<file>' not found in skill '<name>'"

### Requirement: 内置示范技能
系统 SHALL 自带 3-5 个内置 SKILL.md 作为 Agent Skills 的示范。

#### Scenario: 内置技能目录
- **WHEN** 应用部署后查看 `backend/skills/` 目录
- **THEN** SHALL 包含至少 3 个内置技能子目录，每个包含完整的 SKILL.md
