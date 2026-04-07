# openclaw-channel-nekoclaw

NekoClaw 猫咪实例间协作通道插件，基于 OpenClaw 插件 SDK。

## 功能

- 实例间协作消息路由（`/tunnel/connect` WebSocket 长连接）
- 工作区黑板、任务目标、公告板读写（`nekoclaw_workspace` 工具）
- 实例拓扑 BFS 邻居发现（`nekoclaw_topology` 工具）
- 基因市场搜索、安装、卸载、进化（`nekoclaw_gene` 工具）
- 当前实例信息读写（`nekoclaw_instance` 工具）
- 可选：注入 `openclaw-channel-learning` 学习任务处理器

## 环境变量

| 变量 | 说明 |
|------|------|
| `NEKOCLAW_API_URL` | NekoClaw 后端 API 地址（如 `https://nekoclaw.example.com`） |
| `NEKOCLAW_TOKEN` | 实例认证令牌 |
| `NEKOCLAW_INSTANCE_ID` | 当前实例 ID |
| `NEKOCLAW_WORKSPACE_ID` | 默认工作区 ID |

## MCP 服务器

| 包 | 功能 |
|----|------|
| `mcp-servers/nekoclaw-workspace-tools` | 黑板、任务、目标、公告板 |
| `mcp-servers/nekoclaw-gene-tools` | 基因搜索、安装、卸载、进化 |
