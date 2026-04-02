# 快速上手

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Python | >= 3.12 | 后端运行时 |
| [uv](https://docs.astral.sh/uv/) | latest | Python 包管理器 |
| Node.js | >= 22 | 前端运行时 |
| npm | >= 10 | 前端包管理器 |
| PostgreSQL | >= 16 | 数据库（或用 Docker 启动） |
| Docker | latest | 可选，用于容器化部署 |

## Docker Compose 部署（推荐）

内置 PostgreSQL，无需外部数据库，一键启动。

```bash
cp nekoclaw-backend/.env.example nekoclaw-backend/.env
# 编辑 .env，至少设置 JWT_SECRET
```

**CE 版：**

```bash
docker compose up -d
```

**EE 版（含管理后台）：**

```bash
docker compose -f docker-compose.yml -f docker-compose.ee.yml up -d
```

启动后：

| 服务 | 地址 |
|------|------|
| 用户门户 | http://localhost:4517 |
| 后端 API | http://localhost:8000 |
| Swagger 文档 | http://localhost:8000/docs |
| LLM Proxy | http://localhost:8080 |
| 管理后台 (EE) | http://localhost:4518 |

**使用外部数据库：**

```bash
echo 'DATABASE_URL=postgresql+asyncpg://user:pass@your-host:5432/nekoclaw' > .env
docker compose up -d nekoclaw-backend portal
```

## 本地开发

### 1. 配置环境变量

```bash
cd nekoclaw-backend
cp .env.example .env
# 编辑 .env，填写 DATABASE_URL、JWT_SECRET 等
```

### 2. 一键启动

```bash
./dev.sh              # 自动检测：ee/ 存在 -> EE，否则 -> CE
./dev.sh ce           # 强制 CE 模式（后端 + Portal）
./dev.sh ee           # 强制 EE 模式（后端 + Portal + Admin）
./dev.sh --docker-pg  # 用 Docker 启动 PostgreSQL
```

脚本自动处理依赖安装，带颜色日志前缀启动所有服务，Ctrl+C 统一清理。

| 模式 | 启动的服务 | 端口 |
|------|-----------|------|
| CE | 后端 + LLM Proxy + Portal | 8000, 8080, 4517 |
| EE | 后端 + LLM Proxy + Portal + Admin | 8000, 8080, 4517, 4518 |

### 3. 手动启动（可选）

如果不想用 `dev.sh`，可以分别启动各个服务：

**后端：**

```bash
cd nekoclaw-backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

API: `http://localhost:8000` | Swagger: `http://localhost:8000/docs`

**用户门户：**

```bash
cd nekoclaw-portal
npm install
npm run dev
```

Portal: `http://localhost:4517` | `/api` 自动代理到后端

**LLM Proxy（可选）：**

```bash
cd nekoclaw-llm-proxy
uv sync
uv run uvicorn app.main:app --reload --port 8080
```

**管理后台（EE，需要 `ee/` 目录）：**

```bash
cd ee/nekoclaw-frontend
npm install
npm run dev
```

Admin: `http://localhost:4518`

### 4. 开始使用

打开 `http://localhost:4517`，登录后领养你的第一只猫。

## K8s 部署

```bash
# 按需修改 deploy/k8s/nekoclaw.yaml 中的配置
kubectl apply -f deploy/k8s/nekoclaw.yaml
```

K8s 清单包含：Namespace、ConfigMap、Secret、3 个 Deployment（后端 / LLM Proxy / Portal）、3 个 Service、Ingress。

## 测试

```bash
# 后端
cd nekoclaw-backend
uv run pytest                              # 全部测试
uv run pytest tests/test_xxx.py            # 指定文件
uv run pytest tests/test_xxx.py::test_func # 指定函数
uv run ruff check .                        # Lint 检查

# 前端
cd nekoclaw-portal
npm run test                                           # 全部测试
npm run test -- --run src/components/xxx.spec.ts       # 指定文件
```

## 镜像构建

```bash
cd nekoclaw-artifacts
IMAGE_REGISTRY=your-registry.com IMAGE_TAG=latest ./build.sh
```

构建 `linux/amd64` 架构镜像，包含：nekoclaw-backend、nekoclaw-portal、nekoclaw-llm-proxy；EE 环境额外构建 nekoclaw-admin。

## 关键 API 端点

| 路径 | 说明 |
|------|------|
| `POST /api/v1/auth/login` | 账号密码登录 |
| `POST /api/v1/auth/oauth/callback` | OAuth SSO 登录 |
| `GET /api/v1/instances` | 猫咪列表 |
| `POST /api/v1/instances` | 创建猫咪 |
| `POST /api/v1/deploy/{id}/adopt` | 领养（部署） |
| `GET /api/v1/deploy/{id}/progress` | SSE 领养进度 |
| `GET /api/v1/workspaces` | 猫窝列表 |
| `GET /api/v1/genes` | 猫技市场 |
| `WS /api/v1/tunnel/ws` | WebSocket Tunnel |
| `GET /api/v1/admin/*` | EE 管理 API |

## MVP 验证清单

- [ ] PostgreSQL 连接正常，Alembic 迁移成功
- [ ] 后端 `/health` 返回 200
- [ ] 登录成功，获取 JWT
- [ ] 创建猫咪，数据库有记录
- [ ] 领养猫咪，SSE 推送 9 步进度
- [ ] 状态流转：creating -> deploying -> running
- [ ] 创建猫窝，添加成员和驻猫
- [ ] 猫技市场浏览，安装猫技
- [ ] Portal 页面正常渲染
- [ ] Docker Compose 一键启动
- [ ] EE Admin 登录并查看组织/用户
