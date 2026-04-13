## ADDED Requirements

### Requirement: usage_logs 数据表
系统 SHALL 创建 `usage_logs` 表，包含字段：id（UUID）、user_id（FK→users）、session_id（FK→sessions，可 null）、skill_id（FK→skills，可 null）、model（varchar，格式 "provider/model_name"）、prompt_tokens（int）、completion_tokens（int）、latency_ms（int）、status（varchar: success/error）、created_at（timestamp）。user_id + created_at 建联合索引。

#### Scenario: 表结构满足查询需求
- **WHEN** 执行 `alembic upgrade head`
- **THEN** `usage_logs` 表创建成功，含上述所有字段和索引

### Requirement: LLM 日志分页查询 API
系统 SHALL 提供 `GET /api/admin/logs/usage` 接口，支持：page/size 分页、user_id 过滤、model 过滤、status 过滤、start_date/end_date 日期范围过滤，返回日志列表和总数。

#### Scenario: 按用户过滤 LLM 日志
- **WHEN** `GET /api/admin/logs/usage?user_id=xxx&page=1&size=50`
- **THEN** 返回该用户的 usage_log 分页列表，按 created_at 倒序

#### Scenario: 按日期范围过滤
- **WHEN** `GET /api/admin/logs/usage?start_date=2024-01-01&end_date=2024-01-31`
- **THEN** 仅返回该日期范围内（含边界）的日志记录
