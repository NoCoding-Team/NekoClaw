## ADDED Requirements

### Requirement: 启动补生成昨日笔记
系统 SHALL 在启动时检查活跃用户是否缺失昨日笔记，缺失时自动补生成。

#### Scenario: 昨日有对话但无笔记
- **WHEN** 后端服务启动，某用户昨日有消息记录但 `notes/{yesterday}.md` 不存在
- **THEN** 系统 SHALL 调用 `generate_daily_note` 为该用户补生成昨日笔记

#### Scenario: 昨日无对话
- **WHEN** 后端服务启动，某用户昨日无消息记录
- **THEN** 系统 SHALL 跳过该用户的补生成

### Requirement: LLM config fallback 增强
`daily_note_cron` 和 `daily_digest` SHALL 在缺失默认 LLM config 时尝试 fallback 到任意可用配置。

#### Scenario: 无默认配置但有其他配置
- **WHEN** 用户未设置默认 LLM config，但有其他可用的 LLM config
- **THEN** 系统 SHALL 选取该用户的任意一个未删除的 LLM config 用于生成

#### Scenario: 无任何可用配置
- **WHEN** 用户和全局均无任何 LLM config
- **THEN** 系统 SHALL 跳过该用户并记录 WARNING 日志，包含用户 ID

### Requirement: cron 时区统一
`daily_note_cron` 的时间判断和消息查询 SHALL 统一使用 UTC 时区。

#### Scenario: 查询当日消息范围
- **WHEN** cron 在 23:50 UTC 触发并查询当日消息
- **THEN** 查询范围 SHALL 为 `[today 00:00 UTC, today+1 00:00 UTC)`

#### Scenario: 触发时间计算
- **WHEN** cron 计算下次触发时间
- **THEN** 目标时间 SHALL 使用 `datetime.now(timezone.utc)` 而非 `datetime.now()`

### Requirement: 结构化日志
每日笔记和消化任务 SHALL 输出结构化日志，记录每个用户的处理结果。

#### Scenario: 生成成功日志
- **WHEN** 某用户的每日笔记成功生成
- **THEN** 日志 SHALL 包含 `user_id`、`date`、`status=success`、`file_path`

#### Scenario: 生成跳过日志
- **WHEN** 某用户因无消息或无 LLM config 被跳过
- **THEN** 日志 SHALL 包含 `user_id`、`date`、`status=skipped`、`reason`
