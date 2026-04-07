# nanobot-security-layer

NanoBot 工具执行安全层（Python），Monkey-patch `ToolRegistry.execute` 以代理安全评估到 NekoClaw 后端。

## 功能

- 注入 `ToolRegistry.execute` 前置拦截和后置审计
- WebSocket 与 NekoClaw 后端安全端点通信
- 评估失败自动降级为放行（Fail-open）

## 环境变量

| 变量 | 说明 |
|------|------|
| `SECURITY_WS_ENDPOINT` | 安全评估 WebSocket 端点（优先）|
| `NEKOCLAW_BACKEND_URL` | NekoClaw 后端地址（自动拼接 `/api/v1/security/ws`） |
| `NEKOCLAW_API_TOKEN` | 认证令牌 |
| `SECURITY_LAYER_ENABLED` | 设为 `false` 可完全禁用（默认 `true`） |
| `AGENT_INSTANCE_ID` | 上报至后端的实例 ID |
| `WORKSPACE_ID` | 上报至后端的工作区 ID |

## 依赖

```
websockets>=13.0
```

## 使用

```python
# 在 nanobot 启动前调用
from nanobot_security_layer import inject_security_layer
inject_security_layer()
```

或使用入口点脚本 `nanobot-secure` 替代 `nanobot` 命令：

```bash
nanobot-secure serve --config your-config.yaml
```
