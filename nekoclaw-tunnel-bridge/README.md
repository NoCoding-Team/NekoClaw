# nekoclaw-tunnel-bridge

NekoClaw 隧道桥，将 NanoBot 和 ZeroClaw 运行时接入 NekoClaw 后端 WebSocket 隧道。

## 功能

- NanoBot channel 插件（`nanobot.channels` entry-point）
- ZeroClaw 独立桥接进程（代理 `chat.request` → `/webhook`）
- 自动重连（指数退避，最大 30 秒）
- Ping/Pong 心跳保活（45 秒超时）

## 环境变量

| 变量 | 说明 |
|------|------|
| `NEKOCLAW_API_URL` | NekoClaw 后端 API 地址 |
| `NEKOCLAW_TUNNEL_URL` | 隧道 WebSocket 地址（覆盖自动推导） |
| `NEKOCLAW_INSTANCE_ID` | 当前实例 ID |
| `NEKOCLAW_TOKEN` | 实例认证令牌 |
| `ZEROCLAW_GATEWAY_URL` | ZeroClaw 网关地址（默认 `http://localhost:8080`） |
| `ZEROCLAW_BEARER_TOKEN` | ZeroClaw 网关认证令牌（可选） |

## 用法

### NanoBot（自动注册）

安装后 NanoBot 自动发现 `nekoclaw` channel，无需额外配置：

```bash
pip install -e .
```

### ZeroClaw 独立进程

```bash
nekoclaw-tunnel-bridge --runtime zeroclaw
```
