# zeroclaw-security-layer

ZeroClaw 工具执行安全层（Rust crate），通过 `SecuredTool<T>` 包装器代理安全评估到 NekoClaw 后端。

## 功能

- `SecuredTool<T>` 泛型包装器，实现 `Tool` trait
- 工具执行前 `evaluate_before`：deny / allow / modify
- 工具执行后 `evaluate_after`：pass / redact / flag
- `SecurityWsClient` WebSocket 连接池，支持并发请求

## 环境变量

| 变量 | 说明 |
|------|------|
| `SECURITY_WS_ENDPOINT` | 安全评估 WebSocket 端点（优先）|
| `NEKOCLAW_BACKEND_URL` | NekoClaw 后端地址（自动拼接 `/api/v1/security/ws`） |
| `NEKOCLAW_API_TOKEN` | 认证令牌 |
| `AGENT_INSTANCE_ID` | 上报至后端的实例 ID |
| `WORKSPACE_ID` | 上报至后端的工作区 ID |

## 依赖

```toml
[dependencies]
zeroclaw-security-layer = { path = "../zeroclaw-security-layer" }
```

## 使用

```rust
use std::sync::Arc;
use zeroclaw_security_layer::{
    secured_tool::SecuredTool,
    ws_client::SecurityWsClient,
};

let client = Arc::new(SecurityWsClient::new());
client.connect().await;

let secured = SecuredTool::new(my_tool, Arc::clone(&client));
```
