## ADDED Requirements

### Requirement: tool_logs 数据表
系统 SHALL 创建 `tool_logs` 表，包含字段：id（UUID）、user_id（FK→users）、session_id（FK→sessions，可 null）、tool_name（varchar）、executor（varchar: server/client）、sandbox_level（varchar: LOW/MEDIUM/HIGH/DENY）、params_summary（varchar(200)，截取前200字符）、status（varchar: success/error/denied）、error_message（text，可 null）、latency_ms（int）、created_at（timestamp）。建 user_id + created_at 联合索引。

#### Scenario: 表结构满足工具日志需求
- **WHEN** 执行 `alembic upgrade head`
- **THEN** `tool_logs` 表创建成功，含上述所有字段

### Requirement: 工具执行时异步写入日志
系统 SHALL 在服务端工具（`server_tools.py`）执行完毕后，异步写入一条 tool_log，params_summary 截取参数 JSON 字符串的前 200 字节，不可包含完整文件内容或超长命令。

#### Scenario: 工具执行成功日志写入
- **WHEN** `web_search` 工具成功返回结果
- **THEN** 异步写入 tool_log，status=success，tool_name="web_search"，latency_ms 为实际耗时

#### Scenario: 工具被沙盒拒绝时写入 denied 日志
- **WHEN** 沙盒评估结果为 DENY
- **THEN** 写入 tool_log，status=denied，sandbox_level=DENY，error_message 含 deny 原因

### Requirement: 工具日志分页查询 API
系统 SHALL 提供 `GET /api/admin/logs/tools` 接口，支持 page/size、user_id、tool_name、status、sandbox_level 过滤，返回分页列表。

#### Scenario: 按沙盒级别过滤工具日志
- **WHEN** `GET /api/admin/logs/tools?sandbox_level=HIGH`
- **THEN** 返回所有 sandbox_level=HIGH 的工具执行记录
