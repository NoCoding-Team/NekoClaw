## 1. 数据库扩展

- [ ] 1.1 在 `backend/app/models/user.py` 增加 `is_superuser: Mapped[bool]` 字段（默认 False）
- [ ] 1.2 创建 `backend/app/models/usage_log.py` — UsageLog SQLAlchemy 模型（含 user_id、session_id、skill_id、model、prompt_tokens、completion_tokens、latency_ms、status、created_at）
- [ ] 1.3 创建 `backend/app/models/tool_log.py` — ToolLog SQLAlchemy 模型（含 user_id、session_id、tool_name、executor、sandbox_level、params_summary、status、error_message、latency_ms、created_at）
- [ ] 1.4 在 `backend/app/startup.py` 中导入 UsageLog、ToolLog 模型，确保 create_all 时建表
- [ ] 1.5 创建 `backend/scripts/create_superuser.py` — CLI 脚本，接受 --username --password 参数设置 is_superuser=True

## 2. 管理员鉴权依赖

- [ ] 2.1 在 `backend/app/api/deps.py` 新增 `get_current_superuser` 依赖函数，校验 `current_user.is_superuser`，否则抛 HTTP 403
- [ ] 2.2 创建 `backend/app/api/admin/` 目录及 `__init__.py`、`router.py`，在 router.py 中聚合所有 admin 子路由
- [ ] 2.3 在 `backend/app/api/router.py` 中注册 admin router，前缀 `/api/admin`

## 3. 用户管理 API

- [ ] 3.1 创建 `backend/app/schemas/admin.py` — AdminUserOut、UserStatusUpdate、AdminSessionOut 等 Pydantic schemas
- [ ] 3.2 创建 `backend/app/api/admin/users.py` — `GET /users`（分页+keyword）、`PATCH /users/{id}/status`（封禁/启用）、`DELETE /users/{id}`（禁止删超管）

## 4. LLM 配置管理 API（管理员视角）

- [ ] 4.1 在 `backend/app/api/admin/llm_configs.py` 创建管理员版本的 LLM 配置 CRUD（GET 含脱敏 api_key、POST 加密存储、PUT、DELETE 禁删默认）
- [ ] 4.2 在 `backend/app/schemas/admin.py` 补充 AdminLLMConfigOut（含 api_key_masked）

## 5. 日志记录服务

- [ ] 5.1 创建 `backend/app/schemas/usage_log.py` — UsageLogOut、UsageLogFilter Pydantic schemas
- [ ] 5.2 创建 `backend/app/schemas/tool_log.py` — ToolLogOut、ToolLogFilter Pydantic schemas
- [ ] 5.3 创建 `backend/app/services/log_writer.py` — `write_usage_log()`、`write_tool_log()` 异步写入函数（异常时仅 warning）
- [ ] 5.4 修改 `backend/app/services/llm.py`，在 streaming 完成和 except 块中调用 `asyncio.create_task(write_usage_log(...))`
- [ ] 5.5 修改 `backend/app/services/tools/server_tools.py`，在 web_search、http_request 执行后调用 `asyncio.create_task(write_tool_log(...))`

## 6. 日志查询 & 统计 API

- [ ] 6.1 创建 `backend/app/api/admin/logs.py` — `GET /logs/usage`（分页+user_id+model+status+日期范围）、`GET /logs/tools`（分页+user_id+tool_name+status+sandbox_level）
- [ ] 6.2 创建 `backend/app/api/admin/stats.py` — `GET /stats/usage`（days 参数，返回 total_calls/tokens/by_model/daily_trend）

## 7. 会话审计 API

- [ ] 7.1 创建 `backend/app/api/admin/sessions.py` — `GET /sessions`（跨用户分页+user_id+keyword）、`GET /sessions/{id}/messages`、`DELETE /sessions/{id}`（级联删除消息）

## 8. Portal 项目初始化

- [ ] 8.1 在项目根目录创建 `portal/` — 执行 `npm create vite@latest portal -- --template react-ts`
- [ ] 8.2 安装依赖：`ant-design/v5`、`recharts`、`react-router-dom`、`axios`、`@ant-design/icons`
- [ ] 8.3 配置 `portal/vite.config.ts`：设置 server proxy 转发 `/api` 到 `http://localhost:8000`
- [ ] 8.4 创建 `portal/src/api/client.ts` — axios 实例，自动注入 Authorization header，401 时清空 token 并跳转登录页
- [ ] 8.5 创建 `portal/src/store/auth.ts` — Zustand store，管理 token + userInfo（is_superuser）

## 9. Portal 认证页面

- [ ] 9.1 创建 `portal/src/pages/Login/LoginPage.tsx` — antd Form 登录表单，复用 `POST /api/auth/login`，成功后跳转 `/dashboard`
- [ ] 9.2 创建 `portal/src/components/PrivateRoute.tsx` — 检查 token + is_superuser，否则重定向到 `/login`

## 10. Portal Dashboard 页面

- [ ] 10.1 创建 `portal/src/pages/Dashboard/DashboardPage.tsx` — 顶部 4 个统计卡片（总调用次数、总 token、活跃用户数、今日调用）
- [ ] 10.2 在 Dashboard 页面集成 Recharts LineChart，展示最近 7/30 天 token 消耗趋势（调用 `GET /api/admin/stats/usage`）
- [ ] 10.3 在 Dashboard 页面集成 Recharts PieChart，展示模型调用分布

## 11. Portal 用户管理页面

- [ ] 11.1 创建 `portal/src/pages/Users/UsersPage.tsx` — antd Table 展示用户列表，支持关键词搜索、分页
- [ ] 11.2 实现封禁/解封操作（Table action 列 + confirm Modal），调用 `PATCH /api/admin/users/{id}/status`
- [ ] 11.3 实现删除用户操作（confirm 二次确认），调用 `DELETE /api/admin/users/{id}`

## 12. Portal LLM 配置管理页面

- [ ] 12.1 创建 `portal/src/pages/LLMConfigs/LLMConfigsPage.tsx` — antd Table 展示配置列表（含 api_key_masked）
- [ ] 12.2 实现新增/编辑 LLM 配置 Drawer（antd Drawer + Form），提交调用 POST/PUT 接口
- [ ] 12.3 实现删除配置操作，前端提示"不能删除默认配置"

## 13. Portal 使用日志页面

- [ ] 13.1 创建 `portal/src/pages/Logs/UsageLogsPage.tsx` — antd Table，支持 user_id/model/status/日期范围筛选，分页
- [ ] 13.2 创建 `portal/src/pages/Logs/ToolLogsPage.tsx` — antd Table，支持 tool_name/status/sandbox_level 筛选，sandbox_level 用彩色 Tag 展示

## 14. Portal 会话审计页面

- [ ] 14.1 创建 `portal/src/pages/Sessions/SessionsPage.tsx` — antd Table 展示跨用户会话列表，支持 user_id 和 keyword 过滤
- [ ] 14.2 实现点击会话行展开消息详情（antd Drawer），展示完整对话记录（role/content/tool_calls）
- [ ] 14.3 实现管理员删除会话操作（confirm 确认）

## 15. Portal 应用框架

- [ ] 15.1 创建 `portal/src/layouts/AdminLayout.tsx` — antd Layout with Sider（侧边导航：Dashboard/用户/LLM配置/使用日志/工具日志/会话审计）
- [ ] 15.2 创建 `portal/src/App.tsx` — React Router 路由配置，含 PrivateRoute 包裹
- [ ] 15.3 更新 `backend/app/main.py` CORS 配置，允许 portal 开发地址（`http://localhost:3001`）加入 allow_origins
