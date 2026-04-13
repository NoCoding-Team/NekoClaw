## ADDED Requirements

### Requirement: 管理员身份标识
系统 SHALL 在 users 表中增加 `is_superuser` 布尔字段（默认 False），用于标识超级管理员身份。

#### Scenario: 普通用户 is_superuser 默认为 False
- **WHEN** 新用户通过 `POST /api/auth/register` 注册
- **THEN** 其 `is_superuser` 字段值为 False

#### Scenario: 超级管理员通过 CLI 脚本初始化
- **WHEN** 执行 `python backend/scripts/create_superuser.py --username admin --password <pass>`
- **THEN** 对应用户的 `is_superuser` 字段被设置为 True

### Requirement: 管理员路由鉴权中间件
系统 SHALL 对所有 `/api/admin/*` 路由强制校验当前 JWT Token 对应用户的 `is_superuser` 为 True。

#### Scenario: 普通用户访问管理员路由被拒绝
- **WHEN** `is_superuser=False` 的已登录用户发起 `GET /api/admin/users`
- **THEN** 系统返回 HTTP 403，body 为 `{"detail": "Not enough permissions"}`

#### Scenario: 未登录请求访问管理员路由被拒绝
- **WHEN** 请求无有效 JWT Token 访问任意 `/api/admin/*` 路由
- **THEN** 系统返回 HTTP 401

#### Scenario: 超级管理员正常访问管理员路由
- **WHEN** `is_superuser=True` 的用户携带有效 JWT Token 访问 `/api/admin/users`
- **THEN** 系统正常返回数据，HTTP 200
