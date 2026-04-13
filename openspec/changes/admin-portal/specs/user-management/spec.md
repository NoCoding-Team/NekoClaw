## ADDED Requirements

### Requirement: 用户列表查询
系统 SHALL 提供 `GET /api/admin/users` 接口，支持分页（page/size）和关键词过滤（username），返回用户列表及总数，每条记录包含：id、username、is_superuser、is_active、created_at、session_count。

#### Scenario: 分页获取用户列表
- **WHEN** 超级管理员发起 `GET /api/admin/users?page=1&size=20`
- **THEN** 返回 `{items: [...], total: N, page: 1, size: 20}`，items 中每个用户含 session_count 统计

#### Scenario: 按用户名过滤
- **WHEN** 发起 `GET /api/admin/users?keyword=alice`
- **THEN** 仅返回 username 包含 "alice" 的用户（大小写不敏感）

### Requirement: 禁用/启用用户账号
系统 SHALL 提供 `PATCH /api/admin/users/{user_id}/status` 接口，允许超级管理员切换用户的 `is_active` 状态。被禁用用户的后续 API 请求 SHALL 返回 HTTP 403。

#### Scenario: 封禁用户后其 API 请求被拦截
- **WHEN** 超级管理员发起 `PATCH /api/admin/users/{id}/status` body `{"is_active": false}`
- **THEN** 该用户后续携带有效 JWT Token 的请求返回 HTTP 403 `{"detail": "Account disabled"}`

#### Scenario: 超级管理员不能被封禁
- **WHEN** 尝试封禁 `is_superuser=True` 的用户
- **THEN** 系统返回 HTTP 400 `{"detail": "Cannot disable superuser"}`

### Requirement: 超级管理员不可自删
系统 SHALL 拒绝删除 `is_superuser=True` 用户的操作，返回 HTTP 400。

#### Scenario: 删除超级管理员被拒绝
- **WHEN** 发起 `DELETE /api/admin/users/{id}` 且目标用户 is_superuser=True
- **THEN** 返回 HTTP 400 `{"detail": "Cannot delete superuser"}`
