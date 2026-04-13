## ADDED Requirements

### Requirement: 跨用户会话列表查询
系统 SHALL 提供 `GET /api/admin/sessions` 接口，支持 page/size 分页、user_id 过滤、keyword（匹配 session title）过滤，返回会话列表及总数，每条含：id、user_id、username、title、message_count、created_at、updated_at。

#### Scenario: 管理员获取所有用户的会话列表
- **WHEN** 超级管理员发起 `GET /api/admin/sessions?page=1&size=20`
- **THEN** 返回所有用户的会话（不限当前用户），含 username 字段

#### Scenario: 按用户过滤会话
- **WHEN** `GET /api/admin/sessions?user_id=xxx`
- **THEN** 仅返回该用户的会话记录

### Requirement: 查看会话消息详情
系统 SHALL 提供 `GET /api/admin/sessions/{session_id}/messages` 接口，返回该会话的完整消息列表（含 role、content、tool_calls、created_at），管理员可查看任意用户的对话内容。

#### Scenario: 管理员查看他人会话消息
- **WHEN** 超级管理员发起 `GET /api/admin/sessions/{session_id}/messages`，且该 session 属于其他用户
- **THEN** 正常返回消息列表，HTTP 200

#### Scenario: 会话不存在时返回 404
- **WHEN** 请求不存在的 session_id
- **THEN** 返回 HTTP 404 `{"detail": "Session not found"}`

### Requirement: 管理员删除会话
系统 SHALL 提供 `DELETE /api/admin/sessions/{session_id}` 接口，允许超级管理员删除任意用户的会话及其所有消息（级联删除）。

#### Scenario: 管理员成功删除他人会话
- **WHEN** 超级管理员发起 `DELETE /api/admin/sessions/{id}`
- **THEN** 该会话及其所有 messages 被物理删除，返回 HTTP 204
