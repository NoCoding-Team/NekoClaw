## ADDED Requirements

### Requirement: 人设文件存储
系统 SHALL 支持 SOUL.md、USER.md、AGENTS.md 三个人设配置文件，与 MEMORY.md 存放于同一目录 `{MEMORY_FILES_DIR}/{user_id}/`。

#### Scenario: 文件存储位置
- **WHEN** 系统访问用户的人设文件
- **THEN** 文件路径 SHALL 为 `{MEMORY_FILES_DIR}/{user_id}/SOUL.md`、`{MEMORY_FILES_DIR}/{user_id}/USER.md`、`{MEMORY_FILES_DIR}/{user_id}/AGENTS.md`

### Requirement: 默认模板自动创建
系统 SHALL 在首次加载人设文件时，若文件不存在则自动写入默认模板。

#### Scenario: SOUL.md 不存在时自动创建
- **WHEN** `build_system_prompt` 加载 SOUL.md 且文件不存在
- **THEN** 系统 SHALL 写入包含人格、语气、边界三个分区的默认猫咪助手模板，并返回该模板内容

#### Scenario: USER.md 不存在时自动创建
- **WHEN** `build_system_prompt` 加载 USER.md 且文件不存在
- **THEN** 系统 SHALL 写入包含基本信息、偏好、常用技术栈占位分区的默认模板

#### Scenario: AGENTS.md 不存在时自动创建
- **WHEN** `build_system_prompt` 加载 AGENTS.md 且文件不存在
- **THEN** 系统 SHALL 写入包含优先级、记忆策略、行为规则分区的默认模板

#### Scenario: 文件已存在时直接读取
- **WHEN** `build_system_prompt` 加载人设文件且文件已存在
- **THEN** 系统 SHALL 读取文件内容，不覆盖用户自定义内容

### Requirement: 人设文件注入 System Prompt
`build_system_prompt` SHALL 按固定顺序加载人设文件并拼接到 system prompt 中。

#### Scenario: 完整 system prompt 拼接顺序
- **WHEN** `build_system_prompt` 构建系统提示
- **THEN** system prompt SHALL 按以下顺序拼接：SOUL.md 内容 → USER.md 内容 → AGENTS.md 内容 → 工具声明（_TOOL_RULES 中工具列表和执行环境部分） → Skills 目录和规则 → 记忆注入（MEMORY.md + 日报）

#### Scenario: SOUL.md 替代硬编码人设
- **WHEN** SOUL.md 存在且有内容
- **THEN** system prompt SHALL 使用 SOUL.md 内容作为人格定义，不再使用 `_DEFAULT_PERSONA` 硬编码字符串

#### Scenario: 单个文件超长截断
- **WHEN** 任一人设文件内容超过 4000 字符
- **THEN** 系统 SHALL 截断该文件内容至 4000 字符并附加 `\n...(已截断)` 标记

### Requirement: Agent 自主维护 USER.md
Agent SHALL 能够通过 `memory_write("USER.md", ...)` 工具自主更新用户画像。

#### Scenario: 对话中学习用户信息
- **WHEN** Agent 在对话中发现用户的个人信息（如称呼、职业、时区）
- **THEN** system prompt 中的记忆规则 SHALL 引导 Agent 调用 `memory_write` 更新 USER.md

### Requirement: MemoryPanel 编辑人设文件
用户 SHALL 能够通过 MemoryPanel 的已有编辑功能直接编辑 SOUL.md / USER.md / AGENTS.md。

#### Scenario: 在 MemoryPanel 编辑 SOUL.md
- **WHEN** 用户在 MemoryPanel 中选择 SOUL.md 并点击编辑
- **THEN** 系统 SHALL 使用已有的内联编辑功能，保存后通过 `nekoBridge.memory.write` 写入文件

### Requirement: 工具规则拆分
`_TOOL_RULES` 中的行为规则部分 SHALL 移入 AGENTS.md，仅保留工具声明和执行环境描述在硬编码中。

#### Scenario: _TOOL_RULES 仅保留工具声明
- **WHEN** `build_system_prompt` 拼接工具规则
- **THEN** `_TOOL_RULES` SHALL 仅包含工具列表、工具执行环境说明和工具使用的基本规则（如"执行完工具后把结果告诉用户"），不再包含记忆策略、优先级等可由用户自定义的行为规则
