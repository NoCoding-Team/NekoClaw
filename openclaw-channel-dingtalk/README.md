# openclaw-channel-dingtalk

钉钉机器人通道插件，通过 Stream 协议接入 OpenClaw 网关。

## 功能

- 钉钉 Robot Stream 协议双向通信（WebSocket 长连接）
- 支持单聊和群聊消息路由至 OpenClaw 网关（SSE 流式响应）
- 回复支持 Webhook 方式和 Robot API 方式，自动降级

## 环境变量

| 变量 | 说明 |
|------|------|
| `DINGTALK_APP_KEY` | 钉钉应用 AppKey |
| `DINGTALK_APP_SECRET` | 钉钉应用 AppSecret |
| `OPENCLAW_GATEWAY_PORT` | 本地网关端口（默认 3000） |
| `OPENCLAW_GATEWAY_TOKEN` | 网关认证令牌 |

## 配置

在 OpenClaw 配置文件中添加 `dingtalk` 通道账号：

```json
{
  "channelId": "dingtalk",
  "accounts": [
    {
      "id": "default",
      "appKey": "...",
      "appSecret": "..."
    }
  ]
}
```
