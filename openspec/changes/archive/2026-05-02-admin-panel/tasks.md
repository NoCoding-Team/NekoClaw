## 1. 数据库变更

- [x] 1.1 在 `User` 模型新增 `daily_message_limit: int`（默认 -1）和 `daily_creation_limit: int`（默认 -1）字段
- [x] 1.2 新建 `UserDailyUsage` 模型（`user_daily_usage` 表），字段：user_id、date、messages_used、creation_used，主键 (user_id, date)
- [x] 1.3 生成 Alembic 迁移文件并验证 upgrade/downgrade 脚本正确
- [x] 1.4 在 `app/models/__init__.py` 导出新模型

## 2. 配额服务

- [x] 2.1 新建 `app/services/quota.py`，实现 `get_or_create_usage(user_id, date, db)` 惰性创建当日用量记录
- [x] 2.2 实现 `check_message_quota(user, db) -> bool`，返回是否允许发送（-1 时直接返回 True）
- [x] 2.3 实现 `consume_message(user_id, db)`，将当日 messages_used +1
- [x] 2.4 实现 `check_creation_quota(user, db) -> bool` 和 `consume_creation(user_id, db)`

## 3. WebSocket 配额拦截

- [x] 3.1 在 `ws.py` 处理 `message` 事件时调用 `check_message_quota`，超限时发送 `quota_exceeded` 事件（payload: `{type: "message", limit: N, used: N}`）
- [x] 3.2 在 `ws.py` 消息处理成功后调用 `consume_message`

## 4. Skill 系统更新

- [x] 4.1 在 `skill_loader.py` 的 `_parse_frontmatter` 中读取 `default_enabled` 字段（缺失默认 True）
- [x] 4.2 修改 `ensure_user_skill_configs`，新建 SkillConfig 时使用 Skill 的 `default_enabled` 作为初始 `enabled` 值
- [x] 4.3 更新现有 4 个内置 Skill 的 SKILL.md，在 frontmatter 中加入 `default_enabled: true`

## 5. 后端 Admin API

- [x] 5.1 新建 `app/api/admin.py`，注册 `prefix="/admin"` 路由，所有接口使用 `require_admin` 依赖
- [x] 5.2 实现 `GET /admin/stats`（总用户数、今日活跃用户数、今日总消息数、今日创作点消耗）
- [x] 5.3 实现 `GET /admin/users`（用户列表 + 今日用量）
- [x] 5.4 实现 `POST /admin/users`（管理员创建用户）
- [x] 5.5 实现 `PATCH /admin/users/{id}`（修改昵称/密码/is_admin）
- [x] 5.6 实现 `DELETE /admin/users/{id}`（软删除）
- [x] 5.7 实现 `PATCH /admin/users/{id}/quota`（设置配额上限）
- [x] 5.8 实现 `POST /admin/users/{id}/quota/reset`（重置今日用量）
- [x] 5.9 实现 `GET /admin/skills`（内置 Skill 列表）
- [x] 5.10 实现 `POST /admin/skills`（上传 ZIP/SKILL.md，解压到 builtin 目录）
- [x] 5.11 实现 `PATCH /admin/skills/{name}`（修改 default_enabled frontmatter）
- [x] 5.12 实现 `DELETE /admin/skills/{name}`（删除 Skill 文件夹 + 清理 SkillConfig）
- [x] 5.13 在 `app/api/router.py` 注册 admin 路由

## 6. 新建 Admin Web 项目

- [ ] 6.1 在 workspace 根目录创建 `admin/` 目录，初始化 Vite + React + TypeScript 项目
- [ ] 6.2 安装依赖：react-router-dom、axios（或直接用 fetch）、基础 UI 库（建议与 desktop 风格一致）
- [ ] 6.3 配置 `vite.config.ts`，设置 `base: '/admin/'` 以便 FastAPI 子路径 serve
- [ ] 6.4 创建 `src/api/` 目录，封装 `apiFetch` 和各模块 API 函数（auth、users、skills、models、stats）

## 7. Admin Web 页面实现

- [x] 7.1 实现 `LoginPage`：表单登录，成功后检查 `is_admin`，非管理员显示无权限提示
- [x] 7.2 实现 `Layout` 组件：侧边栏导航（概览/用户/模型/Skills）+ 顶栏（当前管理员名 + 退出）
- [x] 7.3 实现 `DashboardPage`：展示 4 个统计卡片（用户数、今日活跃、今日消息、今日创作点）
- [x] 7.4 实现 `UsersPage`：用户表格（分页/搜索）、新建用户按钮、编辑弹窗
- [x] 7.5 实现 `QuotaEditor` 组件：编辑积分上限和创作点上限，-1 显示为"无限制"
- [x] 7.6 实现 `ModelsPage`：复用后端现有全局 LLM config 接口，展示/创建/编辑/删除全局模型
- [x] 7.7 实现 `SkillsPage`：内置 Skill 列表、上传新 Skill、切换默认开关、删除

## 8. FastAPI 挂载 Admin 静态文件

- [x] 8.1 在 `backend/app/main.py` 使用 `StaticFiles` 将 `admin/dist` 挂载到 `/admin`
- [x] 8.2 处理 SPA 路由回退（`/admin/*` 均返回 `index.html`）
- [x] 8.3 更新 `docker-compose.yml`，构建 admin 产物并复制到 backend 容器（或 volume 挂载）

## 9. Electron 客户端拦截管理员

- [x] 9.1 在 `desktop/src/App.tsx` 的 `auth/me` 请求回调中，检测 `is_admin === true` 时执行登出并显示 Toast 提示

## 10. 验证与测试

- [ ] 10.1 验证 Alembic 迁移在现有数据库上正确执行，存量用户 daily_message_limit = -1
- [ ] 10.2 验证配额超限时 WebSocket 发送 `quota_exceeded` 事件，客户端正确展示
- [ ] 10.3 验证 Admin Web 非管理员账号无法进入
- [ ] 10.4 验证 Electron 客户端用管理员账号登录被拦截
- [ ] 10.5 验证内置 Skill 上传后新用户注册时按 default_enabled 初始化 SkillConfig
