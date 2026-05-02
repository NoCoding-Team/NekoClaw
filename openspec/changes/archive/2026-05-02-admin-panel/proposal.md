## Why

NekoClaw 目前缺少管理后台，团队无法集中管理用户账号、控制用户每日使用配额、维护全局默认 LLM 模型以及内置 Skills。需要一个独立的 Web 管理端，仅供管理员使用，与面向普通用户的 Electron 客户端完全分离。

## What Changes

- 新增 `admin/` 独立前端项目（Vite + React），与 `desktop/` 并列，仅管理员可访问
- 新增 `/api/admin/*` 后端路由组，全部受 `require_admin` 保护
- `User` 表新增两个配额字段：`daily_message_limit`、`daily_creation_limit`（-1 = 无限制）
- 新增 `user_daily_usage` 表，按（user_id, date）记录当天消息数和创作点使用量
- WebSocket 消息入口新增配额拦截，超限时向客户端发送 `quota_exceeded` 错误事件
- `SkillConfig` 新增全局默认开关：管理员上传内置 Skill 时可设置新用户默认启用状态
- Electron 客户端登录后检测 `is_admin`，若为管理员则拒绝进入并提示使用 Web 管理端

## Capabilities

### New Capabilities

- `admin-user-management`: 管理员对用户的完整 CRUD，包括创建用户、修改信息、提权、禁用/删除
- `user-quota`: 每用户的每日消息配额（积分）和创作点配额，支持管理员设置上限和手动重置
- `admin-skill-management`: 管理员上传内置 Skill、设置新用户默认开关状态、删除内置 Skill
- `admin-panel-web`: 独立 Web 管理端，包含登录、概览 Dashboard、用户/模型/Skills 管理页面

### Modified Capabilities

- `skill-system`: 内置 Skill 新增全局默认开关字段，影响新用户注册时的初始 SkillConfig 创建逻辑

## Impact

- **后端**: 新增 `app/api/admin.py`、数据库迁移（User 表 + user_daily_usage 表）、`app/services/quota.py`、`ws.py` 配额检查
- **前端**: 新建 `admin/` 项目（独立 Vite + React + TypeScript）
- **Electron 客户端**: `desktop/` 登录流程增加管理员检测拦截
- **数据库**: 两处 schema 变更，需要 Alembic migration
- **无 breaking change**：现有普通用户功能不受影响，配额字段默认 -1（无限制）
