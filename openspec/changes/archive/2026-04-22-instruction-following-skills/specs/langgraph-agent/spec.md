## MODIFIED Requirements

### Requirement: AgentState 类型定义
系统 SHALL 定义 `AgentState(TypedDict)` 作为图的状态容器，包含 `messages`（消息列表，使用 `add_messages` 注解实现追加语义）、`session_id`、`user_id`、`ws`（WebSocket 引用）、`llm_config`、`context_limit`、`user_turn_count`、`allowed_tools`、`custom_llm_config`、`ephemeral`、`local_history`。

#### Scenario: State 消息追加
- **WHEN** llm_call 节点返回新的 assistant 消息
- **THEN** AgentState.messages SHALL 通过 `add_messages` reducer 追加消息而非覆盖

#### Scenario: State 不再包含 Skill 字段
- **WHEN** 定义 AgentState
- **THEN** AgentState SHALL 不包含 `skill`、`skill_id` 字段

### Requirement: prepare 节点
`prepare` 节点 SHALL 加载会话历史、构建系统提示（含可用技能快照 + 记忆注入 + 工具规则）、执行上下文裁剪和记忆刷新（当满足触发条件时）。

#### Scenario: 首次消息上下文构建
- **WHEN** 会话中第一条消息到达，数据库无历史消息
- **THEN** prepare 节点 SHALL 构建仅含 system prompt 的消息列表

#### Scenario: 记忆注入到系统提示
- **WHEN** 用户有记忆文件（MEMORY.md 和/或每日笔记）
- **THEN** prepare 节点 SHALL 将记忆内容注入到系统提示的末尾

#### Scenario: 上下文超 70% 触发记忆刷新
- **WHEN** 历史消息总 token 数超过 context_limit 的 70%
- **THEN** prepare 节点 SHALL 执行记忆刷新（让 LLM 分析最近 20 条消息并保存关键信息），然后压缩历史

#### Scenario: 可用技能快照注入
- **WHEN** prepare 节点构建系统提示
- **THEN** 系统 SHALL 调用 `build_available_skills_prompt(allowed_tools)` 获取过滤后的技能列表 XML，注入到系统提示中

#### Scenario: 不再加载 DB Skill
- **WHEN** prepare 节点执行
- **THEN** 系统 SHALL 不查询 `Skill` 数据库表，不使用 `skill_id` 确定系统提示内容
