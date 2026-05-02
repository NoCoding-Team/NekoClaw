## ADDED Requirements

### Requirement: 知识库本地检索工具
系统 SHALL 在客户端 Electron 主进程注册 `search_knowledge_base` 本地执行路径，通过 IPC 提供给渲染进程。

#### Scenario: 客户端本地检索执行
- **WHEN** tools_node 判定本地有索引并将 `search_knowledge_base` 路由到客户端
- **THEN** 客户端 SHALL 通过 `nekoBridge.knowledge.search(query)` 执行本地 SQLite 混合检索并返回结果

#### Scenario: 本地索引状态查询
- **WHEN** 服务端发送 `check_local_index` 事件
- **THEN** 客户端 SHALL 检查本地知识库 SQLite 文件是否存在且非空，回复 `has_index: true/false`

#### Scenario: 知识库目录配置
- **WHEN** 用户在设置中配置知识库目录路径
- **THEN** 系统 SHALL 保存路径到本地配置，并触发首次全量索引构建

## REMOVED Requirements

### Requirement: http_request 客户端执行
**Reason**: `http_request` 从 client 端执行改为 server 端执行，SSRF 防护统一管控。
**Migration**: 桌面端移除 `http_request` 的 WebSocket tool handler。所有 HTTP 请求均由 server 端执行并返回结果。

## ADDED Requirements

### Requirement: 全局工具开关过滤
工具过滤逻辑 SHALL 在用户级白名单之前，先排除 Admin 全局禁用的工具。

#### Scenario: Admin 禁用工具后用户不可见
- **WHEN** Admin 将 `web_search` 全局禁用
- **THEN** 任何用户的 `get_tools()` 结果 SHALL 不包含 `web_search`，无论用户级爪力面板是否启用

#### Scenario: 桌面端爪力面板过滤
- **WHEN** 桌面端加载爪力面板
- **THEN** 面板 SHALL 只展示 `GET /tools/enabled` 返回的工具（即 Admin 全局启用的子集）

#### Scenario: 过滤链顺序
- **WHEN** 构建某次消息的工具列表
- **THEN** 系统 SHALL 按顺序过滤：① Admin 全局启用 → ② 用户爪力白名单 → ③ 消息级 allowed_tools
