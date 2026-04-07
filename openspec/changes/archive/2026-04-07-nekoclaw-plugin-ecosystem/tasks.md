## 1. openclaw-channel-nekoclaw 插件包

- [x] 1.1 创建 `openclaw-channel-nekoclaw/` 目录，初始化 `package.json`（type: module，devDep: openclaw workspace:*）
- [x] 1.2 创建 `openclaw.plugin.json`，声明 channel id `nekoclaw`、label、selectionLabel、aliases
- [x] 1.3 创建 `src/types.ts` — `NekoClawyAccountConfig`、`NekoClawyChannelConfig`、`ResolvedNekoClawyAccount`、`CollaborationPayload`
- [x] 1.4 创建 `src/runtime.ts` — `setNekoClawyRuntime` / `getNekoClawyRuntime` 单例
- [x] 1.5 创建 `src/tunnel-client.ts` — `TunnelClient` 类（WebSocket 重连、ping/pong、消息路由）、`startTunnelClient`、`getTunnelClient`
- [x] 1.6 创建 `src/channel.ts` — `nekoclawPlugin: ChannelPlugin<ResolvedNekoClawyAccount>`（resolveAccount、send、receive）
- [x] 1.7 创建 `src/tools.ts` — `createNekoClawyTools`，含工具：`nekoclaw_workspace`（黑板/OKR/帖子）、`nekoclaw_gene`（基因市场/安装/进化）、`nekoclaw_topology`、`nekoclaw_instance`
- [x] 1.8 创建 `index.ts` — 插件入口，`register(api)` 完成 channel + tunnel + tools 注册，注入 learning handler
- [x] 1.9 创建 `mcp-servers/nekoclaw-workspace-tools/index.ts` — stdio MCP Server，工具：get_blackboard、list_tasks、create_task、update_task、archive_task、get_objectives、list_posts、create_post、get_post、reply_post
- [x] 1.10 创建 `mcp-servers/nekoclaw-gene-tools/index.ts` — stdio MCP Server，工具：search_genes、get_gene_detail、install_gene、uninstall_gene、list_instance_genes、get_evolution

## 2. openclaw-channel-dingtalk 插件包

- [x] 2.1 创建 `openclaw-channel-dingtalk/` 目录，初始化 `package.json`
- [x] 2.2 创建 `openclaw.plugin.json`，声明 channel id `dingtalk`
- [x] 2.3 创建 `src/types.ts` — `DingTalkAccountConfig`、`ResolvedDingTalkAccount`
- [x] 2.4 创建 `src/runtime.ts` — getDingTalkRuntime / setDingTalkRuntime 单例
- [x] 2.5 创建 `src/stream.ts` — DingTalk Stream WebSocket 连接与消息解析（单聊 + 群 @mention）
- [x] 2.6 创建 `src/send.ts` — `sendTextMessage` / `sendMarkdownMessage`，POST 到 sessionWebhook
- [x] 2.7 创建 `src/channel.ts` — `dingtalkPlugin: ChannelPlugin`，集成 stream + send
- [x] 2.8 创建 `index.ts` — 插件入口

## 3. openclaw-security-layer TypeScript 插件包

- [x] 3.1 创建 `openclaw-security-layer/` 目录，初始化 `package.json`
- [x] 3.2 创建 `openclaw.plugin.json`，声明 plugin id `security-layer`
- [x] 3.3 创建 `src/types.ts` — `BeforeResult`、`AfterResult`、`BeforeAction`、`AfterAction` 类型
- [x] 3.4 创建 `src/ws-client.ts` — WebSocket 客户端（连接、重连、`evaluateBefore`、`evaluateAfter`、pending map），优先读 `SECURITY_WS_ENDPOINT`，回退 `NEKOCLAW_BACKEND_URL`
- [x] 3.5 创建 `index.ts` — 插件注册，`before_tool_call` → deny/modify/allow，`after_tool_call` → 上报

## 4. nanobot-security-layer Python 包

- [x] 4.1 创建 `nanobot-security-layer/` 目录，初始化 `pyproject.toml`（依赖 websockets>=12.0）
- [x] 4.2 创建 `nanobot_security_layer/__init__.py`，导出 `inject_security_layer`
- [x] 4.3 创建 `nanobot_security_layer/types.py` — `BeforeAction`、`AfterAction`、`Severity`、`Finding`、`BeforeResult`、`AfterResult` dataclass
- [x] 4.4 创建 `nanobot_security_layer/ws_client.py` — 异步 WebSocket 客户端（connect、_recv_loop、evaluate_before、evaluate_after、_schedule_reconnect），端点从 `SECURITY_WS_ENDPOINT` 或 `NEKOCLAW_BACKEND_URL` 派生
- [x] 4.5 创建 `nanobot_security_layer/injector.py` — `inject_security_layer()`，monkey-patch `ToolRegistry.execute`，含 `_security_patched` 幂等保护和 ImportError 保护
- [x] 4.6 创建 `nanobot_security_layer/startup.py` — 便捷入口 `setup()`，供 Nanobot 启动脚本调用

## 5. zeroclaw-security-layer Rust crate

- [x] 5.1 创建 `zeroclaw-security-layer/` 目录，初始化 `Cargo.toml`（依赖 tokio、tokio-tungstenite、serde_json）
- [x] 5.2 创建 `src/types.rs` — `BeforeAction`、`AfterAction`、`BeforeResult`、`AfterResult`、`Finding` struct（serde Deserialize）
- [x] 5.3 创建 `src/ws_client.rs` — token-based WebSocket 客户端（async connect、send_before、send_after、pending HashMap），端点从环境变量派生
- [x] 5.4 创建 `src/secured_tool.rs` — `SecuredTool` trait wrapper，`execute` 方法注入 before/after 评估，deny 时返回 `Err`
- [x] 5.5 创建 `src/lib.rs` — pub mod 声明，导出 `inject_security_layer()` 初始化函数
- [x] 5.6 创建 `examples/test_runtime.rs` — 简单集成测试示例

## 6. nekoclaw-tunnel-bridge Python 包

- [x] 6.1 创建 `nekoclaw-tunnel-bridge/` 目录，初始化 `pyproject.toml`（依赖 websockets>=12.0、httpx>=0.27），声明 `nanobot.channels` entry point 和 `nekoclaw-tunnel-bridge` CLI
- [x] 6.2 创建 `src/nekoclaw_tunnel_bridge/__init__.py`
- [x] 6.3 创建 `src/nekoclaw_tunnel_bridge/client.py` — `TunnelClient`（WebSocket 连接、重连、消息收发、`send_response`、`send_response_error`），端点从 `NEKOCLAW_BACKEND_URL` + `NEKOCLAW_API_TOKEN` 派生
- [x] 6.4 创建 `src/nekoclaw_tunnel_bridge/zeroclaw_bridge.py` — `ZeroClawBridge`：接收 `chat.request` → POST 到 `ZEROCLAW_GATEWAY_URL/webhook` → 回送 `chat.response`
- [x] 6.5 创建 `src/nekoclaw_tunnel_bridge/nanobot_channel.py` — `NekoClawyChannel`（Nanobot channel 接口实现，注册为 nanobot.channels entry point）
- [x] 6.6 创建 `src/nekoclaw_tunnel_bridge/__main__.py` — CLI entry point，`--runtime zeroclaw` 启动 ZeroClawBridge

## 7. 文档与集成

- [x] 7.1 为每个子包写 `README.md`，说明：用途、安装方式、必要环境变量表格、快速使用示例
- [x] 7.2 更新项目根目录 `README.md`，在项目结构一节添加这六个子包的说明
- [x] 7.3 在 `docker-compose.yml` 中添加 `nekoclaw-tunnel-bridge` service（可选，注释掉，仅 ZeroClaw/Nanobot 部署时开启）
- [x] 7.4 （Reminder）后端需补充 `/api/v1/security/ws` WebSocket 端点以启用安全层评估功能
