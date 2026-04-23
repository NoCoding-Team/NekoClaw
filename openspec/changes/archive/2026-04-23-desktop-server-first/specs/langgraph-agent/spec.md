## MODIFIED Requirements

### Requirement: prepare 节点
`prepare` 节点 SHALL 加载会话历史、构建系统提示（含技能 prompt + 记忆注入 + 工具规则）、执行上下文裁剪和记忆刷新（当满足触发条件时）。prepare 节点 SHALL NOT 支持 ephemeral 模式，所有会话历史 SHALL 从数据库加载。

#### Scenario: 首次消息上下文构建
- **WHEN** 会话中第一条消息到达，数据库无历史消息
- **THEN** prepare 节点 SHALL 构建仅含 system prompt 的消息列表

#### Scenario: 记忆注入到系统提示
- **WHEN** 用户有记忆文件（MEMORY.md 和/或每日笔记）
- **THEN** prepare 节点 SHALL 将记忆内容注入到系统提示的末尾

#### Scenario: 上下文超 70% 触发记忆刷新
- **WHEN** 历史消息总 token 数超过 context_limit 的 70%
- **THEN** prepare 节点 SHALL 执行记忆刷新后压缩历史

### Requirement: AgentState 类型定义
系统 SHALL 定义 `AgentState(TypedDict)` 作为图的状态容器。AgentState SHALL NOT 包含 `ephemeral` 和 `local_history` 字段。

#### Scenario: State 无 ephemeral 字段
- **WHEN** AgentState 被构造
- **THEN** AgentState SHALL 不包含 `ephemeral: bool` 和 `local_history: list[dict]` 字段

## REMOVED Requirements

### Ephemeral 模式
**Reason**: 桌面端全面转向服务端存储，ephemeral 模式（消息不入库、使用 local_history）失去存在意义
**Migration**: 删除 `prepare()` 中 ephemeral 分支、删除 `AgentState` 中 `ephemeral`/`local_history` 字段、删除 `ws.py` 中 ephemeral/local_history 解析逻辑、删除前端 `useWebSocket.ts` 中相关状态管理
