## Context

NekoClaw 是一个全新的 DeskClaw 人机共营操作系统管理平台。参考 NoDeskClaw 的完整架构（Python 3.12 + FastAPI + Vue 3 + K8s），但以可爱猫咪 IP 为核心，将整个产品打造成深层"猫咪模拟经营"体验。

NoDeskClaw 使用的核心架构模式（CE/EE 分层、两阶段异步部署、Service Layer、Factory Pattern）已被验证可行，NekoClaw 在技术层面直接复用这些模式，在领域层面用猫咪世界观重新定义所有概念。

当前状态：项目从零开始，仅有空 README.md 和 OpenSpec 配置。

## Goals / Non-Goals

**Goals:**

- 建立完整的猫咪世界观领域模型，每个系统概念都有猫咪隐喻对应
- 复用 NoDeskClaw 验证过的技术架构（CE/EE Factory、两阶段部署、SSE、Service Layer）
- 前后端完整可运行：后端 API + Portal 前端 + Admin 前端(EE) + LLM Proxy
- 深层猫咪主题化 UI/UX：状态动画、操作文案、视觉风格全面猫咪化
- 支持 K8s 集群部署和管理 AI 实例
- 支持 i18n 国际化（zh-CN / en-US）

**Non-Goals:**

- 不做自有 AI 运行时（OpenClaw/ZeroClaw/Nanobot 等运行时由上游提供，NekoClaw 只做管理）
- 不做移动端 App（仅 Web）
- 第一版不做自定义 Channel 插件开发框架（先内置几个核心 Channel）
- 不做独立的猫咪游戏系统（猫咪隐喻服务于管理体验，不是独立游戏）

## Decisions

### D1: 猫咪世界观领域映射

| NoDeskClaw 概念 | NekoClaw 猫咪概念 | 理由 |
|-----------------|-------------------|------|
| Workspace | 猫窝 (Nest) | 猫的领地，自然的团队空间隐喻 |
| Instance | 猫咪 (Neko) | 每只 AI 就是一只有个性的猫 |
| Gene | 猫技 (Trick) | 猫咪学会的技能，可磨爪学技/打盹遗忘 |
| Genome | 技能套装 (Trick Set) | 一组猫技的组合包 |
| Channel | 猫道 (Cat Flap) | 猫咪进出的小门 |
| Deploy | 领养 (Adopt) | 部署一只新猫 = 领养 |
| DeployProgress | 猫咪孵化 (Hatching) | 领养进度 = 孵化过程 |
| Gene Market | 训练场 (Training Ground) | 浏览和获取猫技的地方 |
| LLM Proxy | 猫粮站 (Kibble Station) | AI 的大脑供电 = 猫吃粮补能 |
| Security Layer | 铃铛 (Bell) | 猫脖子上的铃铛，每次行动都响 |
| Organization | 猫舍 (Cattery) | 多租户容器 |
| Blackboard | 留言板 (Notice Board) | 猫窝墙上贴的便签 |
| Objective | 狩猎目标 (Hunt) | 团队目标 = 猫咪的狩猎计划 |
| Member Role | 猫窝角色 | admin=猫窝主人, manager=管家, operator=铲屎官, viewer=访客 |

**备选方案：** 直接使用 NoDeskClaw 原始术语 → 放弃，因为猫咪隐喻是 NekoClaw 的核心差异化

### D2: 技术栈（与 NoDeskClaw 一致）

| 组件 | 技术 |
|------|------|
| 后端 | Python 3.12 + FastAPI + SQLAlchemy(async) + asyncpg + PostgreSQL |
| Portal 前端 | Vue 3 + Vite + TypeScript + Tailwind CSS + Three.js |
| Admin 前端(EE) | Vue 3 + Vite + TypeScript + Tailwind CSS + shadcn-vue |
| LLM Proxy | Python + FastAPI |
| 容器编排 | K8s (kubernetes-asyncio) |
| 认证 | JWT (python-jose) + OAuth SSO |
| 加密 | AES-256-GCM (cryptography) |
| SSE | fetchEventSource (前端) + StreamingResponse (后端) |
| 图标 | lucide-vue-next |
| 状态管理 | Pinia |
| i18n | vue-i18n |

**理由：** NoDeskClaw 的技术栈已被验证，直接复用降低技术风险

### D3: CE/EE 架构（与 NoDeskClaw 一致）

- **FeatureGate**：检测 `ee/` 目录存在性 → edition
- **4 Factory**：DeploymentAdapter / EmailTransport / OrgProvider / QuotaChecker
- **前端 EE 路由**：`ee-stub.ts`(空数组) ↔ Vite alias 切换 `ee/frontend/portal/routes.ts`
- **EE Model 注册**：lifespan 中 `create_all` 前条件导入 `ee.backend.models`
- **Hooks 事件系统**：CE emit → EE handler

**理由：** 这套模式优雅且低耦合，无需条件编译或 feature flag 服务

### D4: 猫咪状态机设计

Instance 状态映射为猫咪拟人状态：

```
creating   → 孵化中 (Hatching)      — 蛋壳裂开动画
pending    → 等待中 (Waiting)       — 猫咪在门外等
deploying  → 出生中 (Being Born)    — 猫咪破壳
running    → 清醒活跃 (Awake)       — 趴着/站着的猫
learning   → 磨爪中 (Sharpening)    — 猫在磨爪子
restarting → 伸懒腰 (Stretching)    — 猫在伸懒腰
updating   → 换毛中 (Molting)       — 猫在换毛
failed     → 不舒服 (Unwell)        — 蜷缩的猫
deleting   → 离开中 (Leaving)       — 猫走向远方
idle       → 打盹中 (Napping)       — 睡觉的猫
```

### D5: UI 视觉风格

- **色调**：暖色系 — 奶油白底、柔粉/薄荷/淡橙点缀，区别于 NoDeskClaw 的暗色紫蓝科技风
- **3D 场景**：Three.js 渲染猫窝（等距视角），猫咪在场景中有对应状态的动画
- **图标**：lucide-vue-next，配合猫咪主题定制部分图标
- **交互文案**：全面猫咪化（"确定要让这只小猫休息吗？" "正在为小猫准备猫粮..."）
- **部署进度**：猫咪孵化动画，蛋壳逐步裂开 → 小猫出生 → 伸懒腰 → 清醒

### D6: 数据库设计原则（与 NoDeskClaw 一致）

- UUID 主键
- 全部软删除（`deleted_at`）
- Partial Unique Index（`WHERE deleted_at IS NULL`）
- Alembic 异步迁移
- 时间戳混入（`created_at` / `updated_at`）

### D7: 两阶段异步部署 + SSE（与 NoDeskClaw 一致）

```
POST /api/v1/adopt (领养请求)
  ├── 同步：创建 Neko(Instance) + AdoptRecord(DeployRecord) → 返回 adopt_id
  └── 异步：asyncio.create_task(execute_adopt_pipeline)
       ├── 9 步 K8s 操作，每步 EventBus.publish("adopt_progress", ...)
       └── SSE 端点 GET /api/v1/adopt/progress/{adopt_id} 推送到前端
```

### D8: 项目目录结构

```
NekoClaw/
├── nekoclaw-portal/          # 用户门户 (CE+EE)
├── nekoclaw-backend/         # 后端 API
├── nekoclaw-llm-proxy/       # 猫粮站 (LLM Proxy)
├── nekoclaw-artifacts/       # 镜像构建
├── features.yaml             # CE/EE 功能清单
├── docker-compose.yml        # CE
├── docker-compose.ee.yml     # EE
├── ee/                       # EE 私有
│   ├── backend/
│   ├── nekoclaw-frontend/    # Admin 管理后台
│   └── frontend/portal/     # Portal EE 路由
├── deploy/                   # K8s 部署
├── scripts/
└── openspec/
```

## Risks / Trade-offs

- **[大量 Capability] → 分阶段实施**：15 个 Capability 全做完工程量很大，需严格按 P0/P1/P2 分批。P0 先做核心可用（认证 + 猫咪 CRUD + 领养部署 + SSE 进度），P1 做猫窝 + 猫技，P2 做猫道 + 铃铛 + 完整 CE/EE
- **[猫咪动画制作成本] → 先用 CSS 动画 + 静态插图**：3D 猫咪动画需要建模和动画资源，初期使用 CSS 动画 + SVG/PNG 猫咪状态图，后期迭代为 Three.js 3D
- **[领域术语学习曲线] → API 内部保持技术术语**：对外 UI 用猫咪术语，对内 API/Model 层保留技术术语（如 Model 仍叫 `Instance` 不叫 `Neko`），通过 i18n 层翻译，避免代码可读性下降
- **[与 NoDeskClaw 代码同步] → 不做**：NekoClaw 是独立项目，参考架构但不 fork/同步代码，避免耦合
