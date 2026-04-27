## ADDED Requirements

### Requirement: 定时任务记忆策略隔离
系统 SHALL 为定时任务创建的会话标记来源和记忆策略，并默认阻止定时任务结果自动写入长期记忆。

#### Scenario: 定时任务会话标记来源
- **WHEN** 定时任务触发并自动创建新会话
- **THEN** 系统 SHALL 将该会话标记为定时任务来源，并记录只读或不自动写入的记忆策略

#### Scenario: 定时任务使用独立提示词
- **WHEN** 定时任务消息发送给 Agent
- **THEN** 系统 SHALL 在任务上下文中说明这是计划任务执行，结果默认是临时输出，不得主动写入长期记忆

#### Scenario: 明确要求记住时允许写入
- **WHEN** 定时任务描述明确要求保存、记住或更新长期记忆
- **THEN** 系统 SHALL 允许 Agent 按记忆工具规则读取并写入目标记忆文件

#### Scenario: 默认跳过自动记忆刷新
- **WHEN** 定时任务会话完成一轮对话
- **THEN** 系统 SHALL 默认跳过该会话的自动 memory refresh
