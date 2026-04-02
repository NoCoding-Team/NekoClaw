# NekoClaw

可爱猫咪 AI 经营伙伴管理平台 — 在猫窝里养猫、训猫、和猫一起工作。

## 项目结构

| 组件 | 技术 | 说明 |
|------|------|------|
| nekoclaw-backend | Python 3.12 + FastAPI + SQLAlchemy + PostgreSQL | 后端 API |
| nekoclaw-portal | Vue 3 + Vite + TypeScript + Tailwind CSS + Three.js | 用户门户 (CE+EE) |
| ee/nekoclaw-frontend | Vue 3 + Vite + TypeScript + shadcn-vue | 管理后台 (EE-only) |
| nekoclaw-llm-proxy | Python + FastAPI | 猫粮站 (LLM Proxy) |
| nekoclaw-artifacts | Shell | 镜像构建脚本 |

## 快速开始

### 环境要求

- Python 3.12+、uv
- Node.js 22+、npm
- PostgreSQL 16+
- Docker (可选，用于容器化部署)

### 本地开发

```bash
# 1. 启动 PostgreSQL（已有可跳过）
docker compose up postgres -d

# 2. 后端
cd nekoclaw-backend
cp .env.example .env     # 编辑数据库连接等配置
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 3. 用户门户
cd nekoclaw-portal
npm install
npm run dev              # http://localhost:4517

# 4. LLM Proxy（可选）
cd nekoclaw-llm-proxy
uv sync
uv run uvicorn app.main:app --reload --port 8080

# 5. EE 管理后台（需要 ee/ 目录）
cd ee/nekoclaw-frontend
npm install
npm run dev              # http://localhost:4518
```

### Docker 部署

```bash
# CE
docker compose up --build

# EE（需要 ee/ 目录）
docker compose -f docker-compose.yml -f docker-compose.ee.yml up --build
```

### K8s 部署

```bash
kubectl apply -f deploy/k8s/nekoclaw.yaml
```

## 测试

```bash
# 后端单元测试
cd nekoclaw-backend
uv run pytest

# 前端测试
cd nekoclaw-portal
npm run test
```

## 猫咪世界观

| 系统概念 | 猫咪隐喻 | 说明 |
|---------|----------|------|
| Workspace | 猫窝 (Nest) | 人 + AI 的共享工作空间 |
| Instance | 猫咪 (Neko) | K8s 上的 AI 伙伴实例 |
| Gene | 猫技 (Trick) | 可学习的技能包 |
| Channel | 猫道 (Cat Flap) | 通信插件 |
| Deploy | 领养 (Adopt) | 部署新实例 |
| LLM Proxy | 猫粮站 (Kibble Station) | LLM 代理 |
| Security Layer | 铃铛 (Bell) | 工具调用安全拦截 |
| Organization | 猫舍 (Cattery) | 多租户容器 |

## CE/EE 架构

- CE（社区版）：主仓库开源，包含完整后端 + Portal 前端
- EE（企业版）：`ee/` 目录为私有模块，运行时通过 `FeatureGate` 自动检测
- 4 个 Factory 抽象层：DeploymentAdapter、EmailTransport、OrgProvider、QuotaChecker

## 关键 API 端点

| 路径 | 说明 |
|------|------|
| `POST /api/v1/auth/oauth/callback` | OAuth 登录 |
| `POST /api/v1/auth/login` | 账号密码登录 |
| `GET /api/v1/instances` | 实例列表 |
| `POST /api/v1/instances` | 创建实例 |
| `POST /api/v1/deploy/{id}/adopt` | 领养（部署）实例 |
| `GET /api/v1/deploy/{id}/progress` | SSE 部署进度 |
| `GET /api/v1/workspaces` | 猫窝列表 |
| `GET /api/v1/genes` | 猫技市场 |
| `WS /api/v1/tunnel/ws` | WebSocket Tunnel |
| `GET /api/v1/admin/*` | EE 管理后台 API |

## MVP 验证清单

- [ ] PostgreSQL 连接正常，Alembic 迁移成功
- [ ] 后端 `/health` 返回 200
- [ ] OAuth 或账号密码登录成功，获取 JWT
- [ ] 创建实例，验证数据库记录
- [ ] 领养实例，SSE 推送 9 步进度
- [ ] 实例状态流转：creating → deploying → running
- [ ] 创建猫窝，添加成员和驻猫
- [ ] 猫技市场浏览、安装猫技到实例
- [ ] Portal 前端登录页正常渲染
- [ ] Portal 实例列表、创建、详情页面可用
- [ ] Docker Compose 一键启动全部服务
- [ ] EE Admin 登录并查看组织/用户列表

## License

MIT
