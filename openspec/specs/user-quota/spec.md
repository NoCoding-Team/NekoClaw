## ADDED Requirements

### Requirement: 用户每日消息配额（积分）限制
系统 SHALL 追踪每个用户每天发送的消息数量，并在超出限额时拒绝新消息。

#### Scenario: 用户未超出消息配额时正常发送
- **WHEN** 用户通过 WebSocket 发送消息且今日 messages_used < daily_message_limit（或 daily_message_limit = -1）
- **THEN** 系统正常处理消息并将 messages_used +1

#### Scenario: 用户超出消息配额时被拒绝
- **WHEN** 用户通过 WebSocket 发送消息且今日 messages_used >= daily_message_limit（且 daily_message_limit != -1）
- **THEN** 系统向客户端发送 `quota_exceeded` 事件（包含 type="message" 和剩余配额信息），不处理本次消息

#### Scenario: 无限制用户不受影响
- **WHEN** 用户的 daily_message_limit = -1
- **THEN** 系统不执行配额检查，消息正常处理

### Requirement: 用户每日创作点配额限制
系统 SHALL 追踪每个用户每天消耗的创作点数量（调用有外部请求的 server tools 时消耗），并在超出限额时跳过工具调用。

#### Scenario: 调用外部工具时扣减创作点
- **WHEN** agent 执行需要外部网络请求的 server tool（get-weather、summarize-webpage 等）且 creation_used < daily_creation_limit（或 daily_creation_limit = -1）
- **THEN** 工具正常执行，creation_used +1

#### Scenario: 创作点耗尽时工具调用被跳过
- **WHEN** agent 尝试执行 server tool 且 creation_used >= daily_creation_limit（且 daily_creation_limit != -1）
- **THEN** 系统向客户端发送 `quota_exceeded` 事件（type="creation"），工具返回配额超限错误信息

### Requirement: 管理员可设置用户配额
系统 SHALL 允许管理员为每个用户单独设置 daily_message_limit 和 daily_creation_limit。

#### Scenario: 设置用户消息配额
- **WHEN** 管理员 PATCH `/api/admin/users/{id}/quota` 提供 daily_message_limit
- **THEN** 系统更新用户的 daily_message_limit 字段（-1 表示无限制）

#### Scenario: 手动重置用户今日用量
- **WHEN** 管理员 POST `/api/admin/users/{id}/quota/reset`
- **THEN** 系统删除该用户当天的 user_daily_usage 记录，用量归零

### Requirement: 今日用量按自然日自动重置
系统 SHALL 通过日期键（user_id + date）实现用量隔离，每天自然日零点自动开始新的计数（无需定时任务）。

#### Scenario: 新的一天首次发消息
- **WHEN** 用户在新的日历日期首次发消息
- **THEN** 系统为当天惰性创建新的 user_daily_usage 记录，messages_used 从 0 开始计数
