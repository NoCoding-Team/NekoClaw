# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

NekoClaw — 猫咪 AI 经营伙伴管理平台，通过 Web 界面管理 K8s 集群上的 AI 猫咪实例，支持一键部署、实时日志、基因训练、隧道连接。

采用 CE（社区版）/ EE（企业版）双版本架构：CE 为本仓库开源部分，EE 在私有 `ee/` 目录，运行时通过 `FeatureGate` 自动检测。

## 项目结构

```
NekoClaw/
├── nekoclaw-portal/               # 用户门户前端（CE + EE，Vue 3 + Tailwind CSS + Three.js）
├── nekoclaw-backend/              # 后端 API 服务（Python 3.12 + FastAPI）
├── nekoclaw-llm-proxy/            # LLM Proxy 猫粮站（Python + FastAPI）
├── nekoclaw-artifacts/            # 镜像构建 & 部署制品
├── features.yaml                   # CE/EE Feature 定义
├── ee/                             # Enterprise Edition 模块（私有）
│   ├── nekoclaw-frontend/         # 管理后台前端（EE-only，Vue 3 + shadcn-vue + Tailwind CSS）
│   ├── backend/                   # EE 后端扩展（models/services）
│   └── frontend/portal/           # Portal EE 路由扩展
└── deploy/k8s/                    # K8s 部署清单
```

## 常用命令

### 后端（Python）

```bash
cd nekoclaw-backend
uv sync                    # 安装依赖（首次）
uv run uvicorn app.main:app --reload --port 8000
uv run pytest              # 运行所有测试
uv run pytest tests/test_xxx.py::test_foo  # 运行单个测试
uv run ruff check .        # 代码检查
uv run ruff check --fix .  # 自动修复
```

### 前端

```bash
# 管理前端（EE-only）
cd ee/nekoclaw-frontend
npm install
npm run dev               # 开发服务器 http://localhost:4518
npm run build             # 构建生产版本

# 用户门户
cd nekoclaw-portal
npm install
npm run dev               # 开发服务器 http://localhost:4517
npm run build
npm run test              # 运行测试（vitest）
npm run test -- --run src/components/xxx.spec.ts  # 运行单个测试
npm run test:watch        # 监听模式
```

## i18n 国际化

- 覆盖范围：`nekoclaw-portal`、`ee/nekoclaw-frontend`、`nekoclaw-backend`
- 前端错误展示：优先使用后端 `message_key` 本地翻译，词条缺失时回退 `message`
- 后端失败响应：`code` + `error_code` + `message_key` + `message` + `data`

## 代码架构

- **前端**：双前端架构。`ee/nekoclaw-frontend`（Admin 管理后台）仅 EE 版部署，CE 用户只有 `nekoclaw-portal`（用户门户）。图标统一使用 `lucide-vue-next`
- **后端**：FastAPI + SQLAlchemy + asyncpg，采用 Service Layer 模式
- **K8s**：通过 kubectl 与 K8s 集群交互，目标节点架构 `linux/amd64`

## K8s 调试常用命令

```bash
# 查看 Pod 状态
kubectl get pods -n <namespace> --context <context-name>

# 查看 Pod 详情和 Events
kubectl describe pod <pod-name> -n <namespace> --context <context-name>

# 查看 Pod 日志
kubectl logs <pod-name> -n <namespace> --context <context-name> --tail=30

# 查看集群 Events
kubectl get events -n <namespace> --context <context-name> --sort-by='.lastTimestamp'

# 查看 Deployment 状态
kubectl get deploy -n <namespace> --context <context-name>
```

**重要**：所有 kubectl 命令必须显式指定 `--context <name>`，禁止依赖 current-context 默认值。

## 关键规则

### 必须遵守

- **禁止使用 emoji**，图标统一使用 `lucide-vue-next`
- **Docker 操作必须指定 `--platform linux/amd64`**（开发机 Apple Silicon arm64，目标集群 amd64）
- **涉及 K8s 问题必须用 kubectl 实际查看集群状态**
- **所有数据删除必须软删除**（设置 `deleted_at`），唯一约束使用 Partial Unique Index
- **修改代码后必须搜索同源逻辑副本并同步修改**
- **部署脚本必须由用户手动执行**，禁止 AI 直接运行部署命令
- **K8s 操作必须指定 `--context <name>`**，禁止依赖 current-context 默认值
- **破坏性操作（删除 namespace/资源、数据库 DELETE、git force push）必须逐项确认**
- **自动提交**：每完成一个单元性改动后必须主动提交 commit，不等用户提醒，也不允许攒多个独立改动最后一次性提交
- **禁止在代码中出现真人个人信息**，邮箱等占位统一使用 `@example.com`

### 问题排查原则

- **先查再答**：不确定的事情先查证，不凭记忆或猜测下结论
- **先读代码再写代码**：涉及第三方项目行为必须先读源码确认
- **端到端验证**：修完后必须验证问题是否真的消失
- **分层排查**：从最终现象反向逐层验证，每层都要有实际证据

### 敏感信息隔离

- 文档、设计资产默认放 `ee/` 私有仓库，CE 仅保留代码和最小必要公开文件
- 代码中发现真人信息必须立即替换并提交

### Git 规范

- **分支命名**：`<type>/<kebab-case-description>`（如 `feat/instance-search`、`fix/deploy-env-serialize`），禁止无意义名称和纯日期名称
- **PR 标题**：与 commit message 格式一致 `<type>(<scope>): <中文描述>`，概括整个 PR 的变更目标

```
<type>(<scope>): <subject>
```

- type: feat / fix / docs / style / refactor / perf / test / chore
- subject 必须使用中文
- 禁止在 commit message 中出现 `Co-authored-by` 标签
