# openclaw-security-layer

OpenClaw 工具执行安全管道插件（TypeScript），通过 WebSocket 代理安全评估到 NekoClaw 后端。

## 功能

- 工具调用前拦截：`allow` / `deny` / `modify` 三级决策
- 工具调用后审计：`pass` / `redact` / `flag` 三级处置
- WebSocket 断线自动重连（3 秒间隔）

## 环境变量

| 变量 | 说明 |
|------|------|
| `SECURITY_WS_ENDPOINT` | 安全评估 WebSocket 端点（优先）|
| `NEKOCLAW_BACKEND_URL` | NekoClaw 后端地址（自动拼接 `/api/v1/security/ws`） |
| `NEKOCLAW_API_TOKEN` | 认证令牌 |
| `SECURITY_LAYER_ENABLED` | 设为 `false` 可完全禁用（默认 `true`） |
| `AGENT_INSTANCE_ID` | 上报至后端的实例 ID |
| `WORKSPACE_ID` | 上报至后端的工作区 ID |

## 使用

在 OpenClaw 配置中加载此插件即可自动生效：

```json
{
  "plugins": ["openclaw-security-layer"]
}
```
