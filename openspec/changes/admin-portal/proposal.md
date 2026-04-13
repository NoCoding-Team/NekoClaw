## Why

NekoClaw 作为多人服务端部署的 AI 助手平台，目前缺少管理可视化界面，管理员无法实时监控 LLM 调用量、Token 消耗、用户行为及工具执行情况，运营完全处于黑盒状态。需要一个 Web 管理后台来提供用户管理、使用统计与日志审计能力。

## What Changes

- 新增 `portal/` 目录作为独立 React Web 管理后台（Vite + React 19 + TypeScript）
- 新增 `backend/app/models/usage_log.py` — LLM 调用使用日志表
- 新增 `backend/app/models/tool_log.py` — 工具执行日志表
- 新增 `backend/app/api/admin/` — 管理员专用 API 路由组（需 is_superuser 鉴权）
- 修改 `backend/app/services/llm.py` — 在每次 LLM 调用后写入 usage_log
- 修改 `backend/app/services/tools/` — 在工具执行后写入 tool_log
- 修改 `backend/app/models/user.py` — 增加 `is_superuser` 字段

## Capabilities

### New Capabilities

- `admin-auth`: 管理员登录与权限校验，基于现有 JWT 体系扩展 is_superuser 标识
- `usage-stats`: LLM 调用统计面板，展示 token 消耗趋势、模型分布、费用估算
- `user-management`: 用户列表管理，支持封禁/解封账号、查看用户会话数
- `llm-config-management`: LLM 配置的增删改查（provider/model/api_key 管理）
- `usage-log`: 每次 LLM 调用的详细日志记录（用户/模型/token/延迟/技能）
- `tool-log`: 每次工具执行的详细日志记录（用户/工具名/参数摘要/沙盒级别/结果状态）
- `session-audit`: 跨用户会话记录查阅，支持分页与关键词过滤

### Modified Capabilities

- `llm-service`: LLM 调用流程新增 usage_log 写入副作用（不改变对话语义，属于实现层变更）

## Impact

- **新增依赖**：`portal/` 需 Vite 6 + React 19 + Recharts（图表）+ Ant Design 5（管理 UI 组件库）
- **数据库**：新增 `usage_logs`、`tool_logs` 两张表，`users` 表增加 `is_superuser` 列（Alembic migration）
- **Backend API**：新增 `/api/admin/*` 路由，全部要求 `is_superuser=True` 的 JWT Token
- **性能**：usage_log/tool_log 写入为异步后台任务（`asyncio.create_task`），不阻塞主流程
- **安全**：管理员路由独立鉴权中间件，防止普通用户越权访问
