## ADDED Requirements

### Requirement: 会话来源驱动的记忆刷新
系统 SHALL 根据会话来源和记忆策略决定是否执行自动 memory refresh。

#### Scenario: 正常对话允许自动刷新
- **WHEN** 正常用户对话达到 memory refresh 触发条件
- **THEN** 系统 SHALL 按既有触发规则执行记忆整理

#### Scenario: 定时任务会话跳过自动刷新
- **WHEN** 定时任务来源会话达到 memory refresh 触发条件
- **THEN** 系统 SHALL 跳过自动 memory refresh，除非该会话明确允许写入记忆

#### Scenario: 旧会话默认兼容
- **WHEN** 旧会话没有来源或记忆策略字段
- **THEN** 系统 SHALL 将其视为正常用户对话，并使用自动记忆策略

### Requirement: 定时任务内容不进入每日记忆整理
系统 SHALL 避免将默认定时任务输出作为每日笔记和 daily digest 的长期记忆来源。

#### Scenario: 每日笔记生成跳过定时任务会话
- **WHEN** 系统生成每日笔记并查询当天消息
- **THEN** 系统 SHALL 排除默认只读记忆策略的定时任务会话消息

#### Scenario: Daily Digest 跳过临时任务内容
- **WHEN** Daily Digest 评估每日笔记内容
- **THEN** 系统 SHALL 将定时任务临时输出视为低价值内容，不得自动整合到 `MEMORY.md`

#### Scenario: 明确记忆任务可参与整理
- **WHEN** 定时任务明确声明需要写入长期记忆
- **THEN** 系统 SHALL 允许该任务输出参与记忆整理流程
