## Why

工具的外部依赖（Tavily API Key、Docker 等）目前只能通过 `.env` 文件配置，admin 完全不可见、不可改，也无法全局启用/禁用工具。需要一个 Admin 工具管理界面，支持全局工具开关、凭证配置（加密入库，热更新）、依赖状态检测，让运维无需重启服务即可管理工具可用性。

## What Changes

- **新增** `tool_configs` 数据库表，存储每个工具的全局启用状态和加密凭证
- **新增** `TOOL_DEFINITIONS` 中每个工具的 `requires` 字段，声明外部依赖（凭证 + 服务）
- **新增** Admin API：工具列表、全局开关、凭证写入、依赖状态检测
- **新增** Admin 前端工具管理页面：按 category 分组展示，全局开关、凭证配置表单、依赖状态指示
- **修改** 工具过滤逻辑：`get_tools()` 和 `build_system_prompt()` 需要先过滤掉 admin 全局禁用的工具，再应用用户级白名单
- **修改** 凭证读取：`web_search` 等工具从数据库读取加密凭证，而非直接从 `settings` 读取（保持 `.env` 作为 fallback）
- **修改** 桌面端爪力面板：只展示 admin 全局启用的工具

## Capabilities

### New Capabilities
- `tool-global-config`: 工具全局配置管理——数据库表、Admin API、全局开关、凭证加密存储
- `admin-tool-ui`: Admin 前端工具管理页面——按 category 分组、开关、凭证表单、依赖状态
- `tool-requires`: 工具依赖声明——TOOL_DEFINITIONS 新增 requires 字段，描述凭证和服务依赖

### Modified Capabilities
- `local-tools`: 工具过滤逻辑增加全局开关层——admin 禁用的工具对用户不可见
- `skill-system`: 技能可用性判断增加全局工具状态——admin 禁用的工具导致依赖该工具的技能不可用

## Impact

- **后端新增**: `models/tool_config.py`、`schemas/tool_config.py`、`api/admin.py` 扩展
- **后端修改**: `tools/definitions.py`（加 requires）、`agent/tools.py`（全局过滤）、`agent/context.py`（全局过滤）、`tools/server_tools.py`（凭证从 DB 读取）
- **前端新增**: `admin/src/pages/ToolsPage.tsx`、`admin/src/api/tools.ts`
- **前端修改**: 桌面端需要从服务端获取全局启用的工具列表
- **数据库**: 新增 `tool_configs` 表，需要 migration
- **兼容性**: `.env` 中的 `TAVILY_API_KEY` 等作为 fallback 继续生效，数据库配置优先
