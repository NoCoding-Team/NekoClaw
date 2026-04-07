## Context

NekoClaw 平台的 AI 猫咪实例运行在三种不同的 AI 运行时上：

| 运行时 | 语言 | 插件机制 |
|--------|------|----------|
| OpenClaw | TypeScript / Node.js | `openclaw/plugin-sdk` 插件体系，支持 `register()` hook |
| Nanobot | Python | 没有原生插件机制，需 monkey-patch `ToolRegistry.execute` |
| ZeroClaw | Rust | 有 trait 抽象，但不支持加载 TypeScript 插件，需独立进程桥接 |

NekoClaw 后端已有：
- `/api/v1/tunnel/connect` — WebSocket，猫咪实例双向消息通道
- `/api/v1/security/ws` — WebSocket，工具调用安全评估端点（已在 `security-layer` spec 定义）

## Goals / Non-Goals

**Goals:**
- 每种运行时都有可安装的 Channel 插件或桥接服务，能连上 NekoClaw Tunnel
- 每种运行时都有对应的安全层包，能拦截工具调用并送后端评估
- 所有插件共享同一套 env var 命名约定，降低运维复杂度
- DingTalk Channel 独立成包，可按需安装

**Non-Goals:**
- 不实现后端 `/api/v1/security/ws` 端点（独立 task 补充）
- 不实现 NekoClaw 管理前端里的插件市场 UI
- 不处理 ZeroClaw 的 Rust crate 发布/打包（仅提供源码）

## Decisions

### 决策 1：NekoClaw Channel 工具内聚于主 channel，不拆独立 learning channel

**方案对比**：
- 方案 A：参考 nodeskclaw，把基因/学习任务单独做一个 `openclaw-channel-learning`
- 方案 B（选择）：把基因工具 `nekoclaw_gene` 和学习任务注入全部内置进 `openclaw-channel-nekoclaw`

**理由**：NekoClaw 的基因系统是平台核心功能，和猫咪实例深度耦合；学习任务通过 Tunnel 下发，Tunnel 本来就在主 channel 里。独立包增加安装步骤，收益为零。Learning 任务注入通过 `tunnelClient.setLearningHandler()` 在注册时完成。

### 决策 2：tunnel-bridge 独立 Python 包，支持 zeroclaw 和 nanobot 两种 runtime

**方案对比**：
- 方案 A：nanobot 通过原生 Python channel 接口对接（不走 bridge）
- 方案 B（选择）：tunnel-bridge 统一处理 zeroclaw 和 nanobot，nanobot 作为 `nanobot.channels` entry point

**理由**：Nanobot 本身没有 Tunnel WebSocket 客户端，让 bridge 充当 nanobot 的 channel 注册点（`[project.entry-points."nanobot.channels"]`），可以复用同一套 TunnelClient，少维护一套实现。

### 决策 3：安全层 env var 使用 `NEKOCLAW_BACKEND_URL` + `SECURITY_WS_ENDPOINT` 覆盖

所有安全层包优先读 `SECURITY_WS_ENDPOINT`，缺省时拼接 `NEKOCLAW_BACKEND_URL` + `/api/v1/security/ws?token=<NEKOCLAW_API_TOKEN>`。这样允许安全层连接和猫咪实例的业务 API 不同的端点（例如安全层走内网直连）。

### 决策 4：Rust zeroclaw-security-layer 只提供 crate，不提供二进制

ZeroClaw 运行时会把 crate 作为 dep 引入，在应用层调用 `inject_security_layer()` 完成初始化。无需独立进程。

### 决策 5：DingTalk channel 包名沿用 `openclaw-channel-dingtalk`

NekoClaw 不修改 DingTalk 协议层逻辑，直接复用 nodeskclaw 的实现并改 branding。channel key 保持 `"dingtalk"`，与 nodeskclaw 的配置格式兼容。

## Risks / Trade-offs

- **后端安全端点未实现** → 安全层启动时会打印 warning 并以「放行所有」模式运行，不会阻断业务
- **ZeroClaw bridge 是独立进程** → 运维需要额外启动一个进程；通过 Docker Compose `nekoclaw-tunnel-bridge` service 解决
- **Nanobot monkey-patch 依赖内部 API** → 如果 Nanobot 升级改了 `ToolRegistry.execute`，patch 会失效；`injector.py` 里有 `_security_patched` 标志位防止重复 patch，并有 ImportError 保护
- **TypeScript 插件需要 openclaw workspace** → 开发时需把 `openclaw/` 作为 workspace peer，生产环境通过 npm publish 解决

## Migration Plan

1. 创建六个子项目目录（纯新增，无迁移风险）
2. 后端补充 `/api/v1/security/ws` 端点（独立 task，不在本变更范围内）
3. Docker Compose 增加 `nekoclaw-tunnel-bridge` service（optional，仅 ZeroClaw / Nanobot 部署需要）
4. 无回滚风险（纯新增代码，不影响已有服务）

## Open Questions

- ZeroClaw 的生产部署方式是否确定（容器内跑 bridge？还是跑在 sidecar？）→ 暂定容器内独立进程，bridge 通过环境变量指向 ZeroClaw gateway
- 后端 `/api/v1/security/ws` 端点的评估逻辑是否需要同步实现？→ 本变更不负责，但 tasks 里应包含一个 reminder task
