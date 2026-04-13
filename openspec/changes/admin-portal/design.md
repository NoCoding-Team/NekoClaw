## Context

NekoClaw 现为多人共享服务端架构：FastAPI backend 提供 LLM 调用、会话管理、技能系统等核心能力，多个用户通过 Electron desktop 客户端连接。当前 backend 无任何日志记录与管理界面，管理员无法感知系统运行状态。

现有代码基础：
- `backend/app/models/` — User、Session、Message、Skill、Memory、ScheduledTask
- `backend/app/services/llm.py` — LLM agentic loop（无日志副作用）
- `backend/app/api/router.py` — 已注册所有业务路由，无 admin 专属路由
- `backend/app/models/user.py` — User 表，无 `is_superuser` 字段

## Goals / Non-Goals

**Goals:**
- 新增 `portal/` — 独立 React Web 管理后台，管理员用浏览器访问
- 新增 `usage_logs`、`tool_logs` 数据表，在 LLM/工具调用时异步写入
- 新增 `/api/admin/*` 路由组，需 `is_superuser=True` JWT 才能访问
- 提供 Dashboard（使用趋势）、用户管理、日志查询、LLM 配置管理四大模块

**Non-Goals:**
- 不实现实时 WebSocket 推送到 portal（轮询即可）
- 不对 desktop 客户端做任何改动
- 不实现多角色权限（只区分普通用户 / 超级管理员）
- 不做日志数据归档清理策略（超出 MVP 范围）

## Decisions

### 决策 1：portal 独立目录，不复用 desktop

**选择**：新建 `portal/` — Vite + React 19 + TypeScript + Ant Design 5 + Recharts

**理由**：portal 是 Web 应用（浏览器访问），desktop 是 Electron 桌面应用，两者运行环境、构建目标完全不同。共享代码会引入不必要耦合。Ant Design 5 提供完整的管理后台组件（Table、Form、DatePicker），避免重复造轮子。Recharts 轻量且与 React 生态吻合。

**备选方案**：Next.js — 过重，SSR 对本项目无意义；复用 desktop 代码 — 编译目标不同，维护成本高。

### 决策 2：usage_log / tool_log 写入策略 — 异步后台任务

**选择**：在 `llm.py` 和 `tools/` 中，调用结束后用 `asyncio.create_task` 写入日志，不等待结果。

**理由**：日志写入不可阻塞主流程（LLM streaming 延迟敏感）。若日志写入失败只记录 warning，不影响用户体验。

**备选方案**：消息队列（Redis/Celery）— 过度设计，当前并发量不需要。

### 决策 3：is_superuser 通过数据库字段控制，不做独立管理员账号体系

**选择**：在 `users` 表新增 `is_superuser: Boolean = False`，首个注册用户或通过 CLI 脚本设置。

**理由**：复用现有 JWT 认证体系，admin 路由的依赖注入只需检查 `current_user.is_superuser`。避免维护两套账号系统。

**备选方案**：独立管理员表 + 独立登录接口 — 引入双 JWT 复杂度，不值得。

### 决策 4：portal 路由 — SPA 客户端路由（React Router）

**选择**：portal 完全静态 SPA，可用 Nginx 或直接 `vite preview` 部署；不依赖后端渲染。

**理由**：backend 只需提供 API，portal 独立部署，职责分离。

### 决策 5：usage_log token 字段记录 prompt + completion 分开存储

**选择**：分开存 `prompt_tokens`、`completion_tokens`，总量在查询时相加。

**理由**：便于后续按调用方向分析成本；符合 OpenAI API 返回的字段结构。

## Risks / Trade-offs

- **[风险] is_superuser 初始化**：新部署环境没有超级管理员，无法登录 portal → 缓解：提供 `backend/scripts/create_superuser.py` CLI 脚本
- **[风险] 日志量增长**：高频使用时 usage_logs 表快速膨胀 → 缓解：加索引（user_id + created_at），后续加分页和日期过滤；清理策略留作下一个 change
- **[风险] CORS 配置**：portal 部署在不同 origin 时需配置 backend CORS → 缓解：在 backend `main.py` 的 CORSMiddleware 中添加 portal origin 配置项
- **[Trade-off] Ant Design 体积**：antd 5 打包后约 1MB+ → 接受，管理后台加载速度不是核心体验
- **[风险] 工具参数敏感信息泄露**：tool_log 记录参数摘要时可能包含用户隐私数据（文件路径、命令内容）→ 缓解：只记录前 200 字符，并在 spec 中明确标注

## Migration Plan

1. 生成 Alembic migration：`users.is_superuser`、`usage_logs` 表、`tool_logs` 表
2. 运行 `alembic upgrade head`
3. 执行 `python backend/scripts/create_superuser.py` 初始化管理员账号
4. 启动 portal：`cd portal && npm install && npm run dev`（开发）或 `npm run build`（生产）
5. 配置 backend CORS 允许 portal origin

**回滚**：`alembic downgrade -1` 撤销新表；新路由通过 router.py 注释即可下线；portal 独立目录不影响 backend 运行。

## Open Questions

- portal 生产部署在哪个端口？（建议 3001，backend 8000）— 需在 `.env.example` 中说明
- 是否需要导出日志为 CSV？— 留作 portal v2
