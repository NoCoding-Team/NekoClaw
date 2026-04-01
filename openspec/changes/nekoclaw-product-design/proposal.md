## Why

NekoClaw 是 DeskClaw 人机共营操作系统的管理平台，与 NoDeskClaw 同类型，但以可爱猫咪 IP 为核心构建完整的"猫咪模拟经营"体验。每只 AI 实例 = 一只猫咪，整个产品体验就是"在猫窝里养猫、训练猫、和猫一起工作"。

需要从零搭建完整的前后端系统，覆盖：后端 API、用户门户、管理后台、LLM 代理、安全层、部署制品，并支持 CE/EE 双版本架构。

## What Changes

- 新建 Python 3.12 + FastAPI + SQLAlchemy + PostgreSQL 后端（`nekoclaw-backend/`）
- 新建 Vue 3 + Vite + TypeScript + Tailwind CSS + Three.js 用户门户（`nekoclaw-portal/`）
- 新建 Vue 3 + shadcn-vue 管理后台（`ee/nekoclaw-frontend/`，EE-only）
- 新建 LLM Proxy 服务（`nekoclaw-llm-proxy/`）
- 新建镜像构建与部署制品（`nekoclaw-artifacts/`）
- 建立 CE/EE 双版本架构：FeatureGate + 4 Factory 抽象层 + Hooks 事件系统
- 建立猫咪世界观领域模型：猫窝(Workspace) → 猫咪(Instance) → 猫技(Gene) → 猫道(Channel)
- 深层猫咪隐喻贯穿全产品 UI/UX：状态动画、部署流程、操作文案全部猫咪化

## Capabilities

### New Capabilities

- `cat-domain-model`: 猫咪世界观领域模型 — 猫窝(Nest/Territory)、猫咪(Neko)、猫技(Instinct/Trick)、猫道(Cat Flap)、猫粮站(Kibble Station)、铃铛(Bell) 的完整概念定义与数据模型
- `ce-ee-architecture`: CE/EE 双版本架构 — FeatureGate 目录检测、4 Factory 抽象层(DeploymentAdapter/EmailTransport/OrgProvider/QuotaChecker)、Hooks 事件系统、Vite alias EE 路由切换
- `auth-system`: 用户认证与授权 — OAuth SSO 登录、JWT Token、KubeConfig AES-256-GCM 加密、AuthActor 上下文、组织成员权限
- `instance-lifecycle`: 猫咪(AI 实例)生命周期管理 — CRUD、K8s 部署、状态机(孵化/清醒/磨爪/打盹/不舒服)、资源配置、网络配置
- `deploy-pipeline`: 两阶段异步部署管道 — 同步创建记录返回 ID + 异步 K8s 9 步操作 + EventBus SSE 实时推送猫咪孵化进度
- `workspace-system`: 猫窝(工作空间)系统 — 六边形拓扑 3D 可视化(Three.js)、成员管理、猫咪在猫窝中的位置/动画、留言板(黑板)、狩猎目标(OKR)、任务委派
- `gene-system`: 猫技(基因)系统 — 技能包 CRUD、磨爪学技(learn)、打盹遗忘(forget)、领悟新技(create) 进化循环、训练场(市场)、基因组合包(Genome)
- `channel-system`: 猫道(通信插件)系统 — 窝内通道(WebSocket Tunnel)、钉钉猫道、训练猫道(Learning Channel)、插件化架构
- `llm-proxy`: 猫粮站(LLM Proxy) — 多 Provider 路由、组织级配额、Token 用量记录、认证鉴权
- `security-layer`: 铃铛(安全层) — 工具调用拦截转发后端评估、支持多运行时(TypeScript/Python/Rust)、Kill Switch
- `cat-themed-ui`: 猫咪主题 UI/UX — 猫咪状态动画(趴着/磨爪/打盹/蜷缩)、孵化进度动画、猫咪化操作文案、暖色调视觉风格、Three.js 猫窝 3D 场景
- `i18n-system`: 国际化系统 — 前后端 i18n 词条、zh-CN/en-US 双语、后端 message_key + 前端本地翻译、猫咪化文案风格
- `portal-frontend`: 用户门户前端 — Vue 3 + Tailwind + Three.js、路由/状态/API 集成、EE 路由 stub 机制
- `admin-frontend`: 管理后台前端(EE-only) — Vue 3 + shadcn-vue、组织/用户/套餐管理、独立项目
- `backend-api`: 后端 API 服务 — FastAPI Service Layer、SQLAlchemy 异步模型(BaseModel + 软删除)、Pydantic Schema、Alembic 迁移、依赖注入

### Modified Capabilities

(无已有能力需要修改，这是全新项目)

## Impact

- **新项目目录**：`nekoclaw-backend/`、`nekoclaw-portal/`、`nekoclaw-llm-proxy/`、`nekoclaw-artifacts/`、`ee/nekoclaw-frontend/`、`ee/backend/`、`ee/frontend/portal/`
- **基础设施**：PostgreSQL 数据库、K8s 集群、Docker 镜像(linux/amd64)
- **外部依赖**：OAuth Provider(飞书等)、LLM Providers(OpenAI/Anthropic/Gemini)、钉钉 API
- **配置文件**：`features.yaml`、`docker-compose.yml`、`docker-compose.ee.yml`、`deploy/k8s/`
