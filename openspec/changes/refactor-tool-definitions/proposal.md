## Why

工具体系经历了多次迭代，累积了分工不清的问题：记忆相关有 5 个工具（含 2 个 legacy）、`fetch_url` 与 `http_request` 职能重叠、工具列表缺少分类元数据导致 system prompt 平铺展示。这次重构旨在精简工具数量、明确分类边界，让 LLM 更准确地选择工具。

## What Changes

- **删除** `save_memory`、`update_memory` 两个 legacy DB 记忆工具及其全部执行代码 **BREAKING**
- **删除** `fetch_url` 工具定义，其功能合并进 `http_request` **BREAKING**
- **修改** `http_request`：executor 从 `client` 改为 `server`，新增 `parse_html` 布尔参数（`true` 时将 HTML 清洗为 Markdown，即原 `fetch_url` 行为） **BREAKING**
- **修改** `http_request`：`method` 参数改为可选，默认 `GET`
- **新增** 所有 TOOL_DEFINITIONS 条目添加 `category` 字段（`internal` / `memory` / `file` / `execution` / `network` / `browser`）
- **修改** system prompt 工具描述改为按 category 分组展示
- **清理** server_tools.py dispatcher 中 legacy 分支、desktop 端 http_request handler

## Capabilities

### New Capabilities
- `tool-categories`: 工具分类元数据体系，为每个工具定义 category 字段，并在 system prompt 中按分类分组展示

### Modified Capabilities
- `fetch-url`: 不再作为独立工具存在，功能合并进 http_request 的 parse_html 模式
- `local-tools`: http_request 从 client 端执行改为 server 端执行，影响桌面端工具处理逻辑

## Impact

- **后端 definitions.py**: 删除 3 个工具定义，修改 1 个，所有定义加 category
- **后端 server_tools.py**: 删除 legacy 函数，fetch_url 执行逻辑合并进 http_request handler
- **后端 context.py**: system prompt 工具描述生成逻辑改为按 category 分组
- **后端 agent/tools.py**: 清理 fetch_url 相关特殊处理
- **桌面端 electron**: 移除 http_request 的 client 端 handler（已改为 server 执行）
- **技能文件**: 引用 `fetch_url` 的技能（如 get-weather、summarize-webpage）需更新为 `http_request` + `parse_html=true`
- **数据库**: 已配置 `fetch_url`/`save_memory`/`update_memory` 的 allowed_tools 记录可能需要迁移或忽略
