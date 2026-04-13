## ADDED Requirements

### Requirement: LLM 调用日志记录
系统 SHALL 在每次 LLM API 调用完成后（包括 streaming 完成），异步写入一条 `usage_logs` 记录，包含：user_id、session_id、model（provider/model_name）、prompt_tokens、completion_tokens、latency_ms、skill_id（可为 null）、status（success/error）。

#### Scenario: 成功的 LLM 调用写入日志
- **WHEN** LLM streaming 完成，`llm_done` 事件发送后
- **THEN** 系统异步写入一条 usage_log，字段完整，status=success，latency_ms 为实际耗时

#### Scenario: LLM 调用失败时写入错误日志
- **WHEN** LLM API 调用抛出异常（如 API key 无效、超时）
- **THEN** 系统写入 usage_log，status=error，prompt_tokens/completion_tokens 为 0

#### Scenario: 日志写入失败不影响主流程
- **WHEN** usage_log 写入数据库时发生异常
- **THEN** 系统记录 warning 日志，用户侧 LLM 响应不受影响

### Requirement: 使用统计汇总 API
系统 SHALL 提供 `GET /api/admin/stats/usage` 接口，返回指定时间范围内的 token 消耗总量、调用次数、按模型分布、按日趋势（按天聚合）。

#### Scenario: 获取最近 7 天的使用统计
- **WHEN** 超级管理员发起 `GET /api/admin/stats/usage?days=7`
- **THEN** 返回数据包含：total_calls、total_prompt_tokens、total_completion_tokens、by_model（数组）、daily_trend（按天数组）

#### Scenario: 时间范围参数校验
- **WHEN** `days` 参数超过 365 或为负数
- **THEN** 系统返回 HTTP 422 参数校验错误
