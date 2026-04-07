## Why

`channel-system` 和 `security-layer` 的需求规格已完整定义，但对应的可安装插件包尚未创建。AI 猫咪实例（OpenClaw / Nanobot / ZeroClaw 三种运行时）无法与 NekoClaw 平台通信，也没有工具调用安全门卫。本次变更将规格落地为六个独立子项目。

## What Changes

- 新增 `openclaw-channel-nekoclaw/` — TypeScript 插件，猫咪实例连接 NekoClaw Tunnel，含黑板/基因/拓扑/实例工具，以及两个 MCP Server
- 新增 `openclaw-security-layer/` — TypeScript 插件，OpenClaw 运行时工具调用安全门卫
- 新增 `nanobot-security-layer/` — Python 包，Nanobot 运行时安全门卫（monkey-patch）
- 新增 `zeroclaw-security-layer/` — Rust crate，ZeroClaw 运行时安全门卫（trait wrapper）
- 新增 `nekoclaw-tunnel-bridge/` — Python 独立进程，为 ZeroClaw / Nanobot 提供 Tunnel 桥接

## Capabilities

### New Capabilities

- `nekoclaw-tunnel-bridge`: ZeroClaw（Rust）和 Nanobot 无法加载 TypeScript 插件，需要独立 Python 进程把 Tunnel WebSocket 消息桥接到对应运行时 webhook

### Modified Capabilities

- `channel-system`: 新增 `openclaw-channel-nekoclaw` 插件包实现，满足「NekoClaw workspace channel」和「Learning channel」需求；新增 DingTalk channel 独立包（`openclaw-channel-dingtalk`）满足「DingTalk channel」需求
- `security-layer`: 新增三个运行时安全层包（TypeScript / Python / Rust），满足「Multi-runtime support」需求

## Impact

- **新增目录**：6 个顶层子项目（含 `openclaw-channel-dingtalk`）
- **运行时依赖**：TypeScript 插件依赖 `openclaw/plugin-sdk`；Python 包依赖 `websockets`、`httpx`；Rust crate 依赖 `tokio`、`tokio-tungstenite`
- **环境变量**：`NEKOCLAW_BACKEND_URL`、`NEKOCLAW_API_TOKEN`、`SECURITY_WS_ENDPOINT`（覆盖全局 WS 地址）、`SECURITY_LAYER_ENABLED`
- **后端前提**：NekoClaw 后端已有 `/api/v1/tunnel/connect`（WebSocket），需确认 `/api/v1/security/ws` 端点存在；若不存在，安全层会优雅降级
- **不修改已有代码**：所有变更为纯新增，不影响 `nekoclaw-backend`、`nekoclaw-portal`
