## ADDED Requirements

### Requirement: 管理员可通过 Web 浏览器登录管理端
系统 SHALL 提供独立的 Web 管理界面，管理员使用账号密码登录，非管理员用户登录后被拒绝访问。

#### Scenario: 管理员成功登录
- **WHEN** 管理员在 Web 管理端输入正确的 username 和 password
- **THEN** 系统调用 `/api/auth/login`，验证 is_admin=true 后进入管理端 Dashboard

#### Scenario: 非管理员尝试登录管理端
- **WHEN** 普通用户在 Web 管理端输入正确的账号密码
- **THEN** 系统登录成功后检测 is_admin=false，显示"无权限访问管理端"并清除 token

### Requirement: 管理端展示系统概览 Dashboard
系统 SHALL 在管理端首页展示系统关键统计数字。

#### Scenario: 查看 Dashboard
- **WHEN** 管理员进入 Dashboard 页面
- **THEN** 页面展示：总用户数、今日活跃用户数、今日总消息数、今日总创作点消耗数

### Requirement: 管理端提供用户管理页面
系统 SHALL 提供用户管理页面，支持查看、创建、编辑用户和配额设置。

#### Scenario: 查看用户列表
- **WHEN** 管理员访问用户管理页面
- **THEN** 页面展示用户表格，包含用户名、昵称、管理员状态、今日用量/配额、创建时间、操作按钮

#### Scenario: 编辑用户配额
- **WHEN** 管理员点击某用户的配额设置
- **THEN** 弹出配额编辑器，可设置每日消息上限和创作点上限（-1 代表无限制）

### Requirement: 管理端提供全局模型配置页面
系统 SHALL 提供模型管理页面，允许管理员管理全局（owner_id=null）的 LLM 配置。

#### Scenario: 查看全局模型列表
- **WHEN** 管理员访问模型管理页面
- **THEN** 页面展示所有 owner_id=null 的 LLM 配置，包含名称、provider、model、默认状态

### Requirement: 管理端提供内置 Skills 管理页面
系统 SHALL 提供 Skills 管理页面，允许管理员上传、编辑默认开关、删除内置 Skills。

#### Scenario: 上传新内置 Skill
- **WHEN** 管理员在 Skills 页面点击上传并选择文件
- **THEN** 文件被上传到后端，Skills 列表刷新显示新增项

### Requirement: Electron 客户端拦截管理员登录
系统 SHALL 在 Electron 桌面客户端中检测管理员身份，管理员无法使用客户端。

#### Scenario: 管理员在客户端登录后被拦截
- **WHEN** 管理员在 Electron 客户端登录成功，`/api/auth/me` 返回 is_admin=true
- **THEN** 客户端立即执行登出，显示提示信息"管理员账号请访问 Web 管理端"
