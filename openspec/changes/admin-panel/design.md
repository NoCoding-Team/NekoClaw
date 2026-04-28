## Context

NekoClaw 是一个私有部署的 AI 助手平台，当前有 Electron 桌面客户端（`desktop/`）和 FastAPI 后端（`backend/`）。现有用户系统已包含 `is_admin` 字段和 `require_admin` 依赖注入，但没有任何管理接口和管理 UI。

目前后端缺少：
- 用户配额字段和每日用量追踪表
- Admin CRUD 路由
- 消息入口的配额拦截逻辑
- 内置 Skill 全局默认开关

前端（Electron）缺少：
- 管理员身份检测和拦截

## Goals / Non-Goals

**Goals:**
- 新建独立 Web 管理端（`admin/`），仅管理员可访问
- 后端新增 `/api/admin/*` 路由组，实现用户 CRUD、配额管理、Skills 管理
- 引入两种配额：每日消息配额（积分）和创作点配额
- Electron 客户端拦截管理员登录，不允许管理员使用客户端

**Non-Goals:**
- 不支持多租户、组织层级管理
- 不实现配额购买/支付流程
- 不实现细粒度权限（角色权限矩阵），仅区分 admin / user 两种角色
- 不实现实时推送（管理端轮询或手动刷新即可）

## Decisions

### D1: 管理端作为独立 Vite 项目而非嵌入现有 desktop/

**选择**: 新建 `admin/` 目录，独立的 Vite + React + TypeScript 项目。

**理由**: 
- 管理端与 Electron 客户端的部署方式、用户群体、功能集完全不同
- 独立项目可通过 Docker 单独 serve 静态文件（`nginx` 或 FastAPI `StaticFiles`）
- 避免把管理端代码打包进 Electron 安装包

**备选方案**: 在 `desktop/` 添加 `/admin` 路由 → 被否，因为会让管理员代码进入 Electron 分发包

**Admin 静态文件部署**: FastAPI 通过 `StaticFiles` 在 `/admin` 挂载编译产物，同端口访问，无需额外 nginx。

---

### D2: 配额字段存在 User 表，用量单独建表

**选择**:
```
User 表新增:
  daily_message_limit: int  (默认 -1，无限制)
  daily_creation_limit: int (默认 -1，无限制)

新建 user_daily_usage 表:
  user_id  PK, FK → users.id
  date     PK (DATE)
  messages_used INT default 0
  creation_used INT default 0
```

**理由**:
- 配额上限是用户属性，适合放 User 表；用量是每天的状态，适合独立行
- 当天无记录时即用量为 0，无需提前初始化（惰性创建）
- 按 (user_id, date) 查询高效，不需要任务定时清零

**备选方案**: 在 User 表直接存 `daily_used + last_reset_at` → 被否，并发更新时需要行锁，且历史数据不可查

---

### D3: 配额拦截在 ws.py 的消息处理入口

**选择**: 在 `ws.py` 接收到 `message` 事件时，调用 `QuotaService.check_and_consume()` 拦截。

**理由**:
- WebSocket 是唯一的对话入口，集中拦截最简洁
- 失败时发送 `quota_exceeded` 事件，客户端已有错误事件处理机制

**积分消耗时机**: 用户发送消息时 +1（而非收到回复后），避免绕过拦截。

---

### D4: 内置 Skill 默认开关存在 skills 目录的 frontmatter

**选择**: 内置 Skill 的 SKILL.md 新增 frontmatter 字段 `default_enabled: true/false`，`skill_loader.py` 读取此字段，在 `ensure_user_skill_configs` 时作为新用户的默认值。

**理由**:
- 无需额外数据库表，管理员上传时直接在文件里声明
- 与现有 `_parse_frontmatter` 逻辑一致，改动最小

---

### D5: Electron 客户端拦截管理员

**选择**: 在登录成功回调（`App.tsx` 中 `apiFetch auth/me`）检查 `is_admin === true`，若为 true 则立即调用 logout，显示 Toast 提示"管理员请访问 Web 管理端"。

**理由**: 纯前端拦截，后端无需改动，实现成本最低，满足小团队场景。

---

### D6: Admin 路由鉴权

所有 `/api/admin/*` 接口统一使用 `require_admin` 依赖（已有），无需额外中间件。

## Risks / Trade-offs

- **[Risk] 配额并发超出**: 高并发下两个请求同时通过检查后双双消耗 → 用 `SELECT ... FOR UPDATE` 或数据库 upsert 原子操作缓解；小团队场景下影响极小
- **[Risk] 管理端无 HTTPS**: 本地局域网部署时 API Key 明文传输 → 建议文档说明生产部署应配 TLS，不在此 change 解决
- **[Trade-off] 创作点消耗时机未定义**: 当前设计创作点在 Skill 工具调用时消耗，但工具调用在 agent 内部执行，需要在 `tools.py` 或 `nodes.py` 增加勾子，实现比消息配额复杂

## Migration Plan

1. Alembic 生成迁移：`User` 表新增两字段，创建 `user_daily_usage` 表
2. 默认值 -1 保证存量用户不受影响
3. 编译 `admin/` 产物放到 `backend/static/admin/`，FastAPI 挂载
4. 更新 `docker-compose.yml` 增加 admin 静态文件 volume（可选）

**回滚**: 删除 `user_daily_usage` 表，User 表删除两字段，移除 admin 路由注册即可。

## Open Questions

- 创作点具体在哪类工具调用时消耗？（当前暂定：调用有网络请求的 server tools 时，如 `get-weather`、`summarize-webpage`）
- Admin Web 的端口/路径：是 `/admin` 子路径（FastAPI serve）还是独立端口？
