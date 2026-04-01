# NekoClaw

可爱猫咪 AI 经营伙伴管理平台 — 在猫窝里养猫、训猫、和猫一起工作。

## 项目结构

| 组件 | 技术 | 说明 |
|------|------|------|
| nekoclaw-backend | Python 3.12 + FastAPI + SQLAlchemy + PostgreSQL | 后端 API |
| nekoclaw-portal | Vue 3 + Vite + TypeScript + Tailwind CSS + Three.js | 用户门户 (CE+EE) |
| ee/nekoclaw-frontend | Vue 3 + Vite + TypeScript + shadcn-vue | 管理后台 (EE-only) |
| nekoclaw-llm-proxy | Python + FastAPI | 猫粮站 (LLM Proxy) |

## 快速开始

```bash
# 后端
cd nekoclaw-backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# 用户门户
cd nekoclaw-portal
npm install
npm run dev

# Docker (CE)
docker compose up

# Docker (EE)
docker compose -f docker-compose.yml -f docker-compose.ee.yml up
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

## License

MIT
