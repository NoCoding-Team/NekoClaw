## ADDED Requirements

### Requirement: 管理员可查看所有用户列表
系统 SHALL 提供用户列表接口，返回所有未删除用户，包含其今日用量统计。

#### Scenario: 获取用户列表
- **WHEN** 管理员调用 `GET /api/admin/users`
- **THEN** 系统返回用户数组，每项包含 id、username、nickname、is_admin、daily_message_limit、daily_creation_limit、今日 messages_used、今日 creation_used、created_at

### Requirement: 管理员可创建用户
系统 SHALL 允许管理员直接创建新用户账号，无需通过注册流程。

#### Scenario: 创建普通用户
- **WHEN** 管理员 POST `/api/admin/users` 提供 username、password、nickname（可选）
- **THEN** 系统创建用户，is_admin 默认 false，返回新用户信息

#### Scenario: 用户名已存在时创建失败
- **WHEN** 管理员创建用户时 username 已被占用
- **THEN** 系统返回 409 Conflict

### Requirement: 管理员可修改用户信息
系统 SHALL 允许管理员修改用户的昵称、密码、管理员状态和禁用状态。

#### Scenario: 修改用户昵称
- **WHEN** 管理员 PATCH `/api/admin/users/{id}` 提供新昵称
- **THEN** 系统更新用户 nickname 并返回更新后的用户信息

#### Scenario: 提升用户为管理员
- **WHEN** 管理员 PATCH `/api/admin/users/{id}` 设置 is_admin=true
- **THEN** 系统更新用户 is_admin 字段

### Requirement: 管理员可删除用户
系统 SHALL 允许管理员软删除用户。

#### Scenario: 删除用户
- **WHEN** 管理员 DELETE `/api/admin/users/{id}`
- **THEN** 系统设置用户 deleted_at 为当前时间，用户无法再登录
