## ADDED Requirements

### Requirement: tool_configs 数据模型
系统 SHALL 提供 `tool_configs` 数据库表，以 `tool_name` 为主键，存储每个工具的全局启用状态和加密凭证。

#### Scenario: 表结构
- **WHEN** 系统初始化 `tool_configs` 表
- **THEN** 表 SHALL 包含字段：`tool_name`（VARCHAR, PK）、`enabled`（BOOL, 默认 True）、`credentials`（TEXT, 可空, 加密 JSON）、`updated_at`（TIMESTAMP）

#### Scenario: 工具未在 tool_configs 中存在时
- **WHEN** 查询某工具的全局状态，但 `tool_configs` 表中无该工具记录
- **THEN** 系统 SHALL 视为全局启用（enabled=True），凭证为空

### Requirement: 凭证加密存储
系统 SHALL 使用与 LLM API Key 相同的加密方案（Fernet）对工具凭证进行加密存储。

#### Scenario: 写入凭证
- **WHEN** Admin 通过 API 设置工具凭证（如 `{"TAVILY_API_KEY": "tvly-xxx"}`）
- **THEN** 系统 SHALL 将 credentials JSON 字符串用 Fernet 加密后存入 `tool_configs.credentials` 字段

#### Scenario: 读取凭证
- **WHEN** 工具执行时需要凭证
- **THEN** 系统 SHALL 从 `tool_configs.credentials` 解密获取，若 DB 无记录则 fallback 到 `.env` 中的对应环境变量

#### Scenario: 凭证 fallback 优先级
- **WHEN** DB 和 `.env` 中均存在同一凭证 key
- **THEN** 系统 SHALL 优先使用 DB 中的值

### Requirement: Admin 工具列表 API
系统 SHALL 提供 `GET /admin/tools` 端点，返回所有工具的配置状态。

#### Scenario: 列出所有工具
- **WHEN** Admin 调用 `GET /admin/tools`
- **THEN** 系统 SHALL 返回 TOOL_DEFINITIONS 中所有工具，每个包含 `name`、`category`、`description`、`enabled`（来自 DB 或默认 True）、`requires`、`status`（依赖检测结果）

#### Scenario: 按 category 分组
- **WHEN** 返回工具列表
- **THEN** 工具 SHALL 按 `category` 字段排序或分组，方便前端按分类渲染

### Requirement: Admin 工具配置更新 API
系统 SHALL 提供 `PATCH /admin/tools/{name}` 端点，支持更新全局开关和凭证。

#### Scenario: 切换全局开关
- **WHEN** Admin 调用 `PATCH /admin/tools/web_search` 携带 `{"enabled": false}`
- **THEN** 系统 SHALL 更新 `tool_configs` 中 `web_search` 的 `enabled` 为 False，立即生效，无需重启

#### Scenario: 设置凭证
- **WHEN** Admin 调用 `PATCH /admin/tools/web_search` 携带 `{"credentials": {"TAVILY_API_KEY": "tvly-xxx"}}`
- **THEN** 系统 SHALL 加密后存入 DB，后续工具执行时使用此凭证

#### Scenario: 不存在的工具
- **WHEN** Admin 调用 `PATCH /admin/tools/not_exist`，但该名称不在 TOOL_DEFINITIONS 中
- **THEN** 系统 SHALL 返回 404

### Requirement: 工具依赖状态检测 API
系统 SHALL 提供 `GET /admin/tools/{name}/check` 端点，检测工具的依赖是否满足。

#### Scenario: 凭证已配置
- **WHEN** 检测 `web_search` 工具，DB 中已有 TAVILY_API_KEY
- **THEN** 系统 SHALL 返回 `credentials_configured: true`

#### Scenario: 服务依赖检测
- **WHEN** 检测 `python_repl` 工具，requires.services 包含 `docker`
- **THEN** 系统 SHALL 执行 Docker ping，返回 `services_available: true/false`

#### Scenario: 就绪状态
- **WHEN** 工具的 credentials 全部配置且 services 全部可用
- **THEN** 系统 SHALL 返回 `ready: true`

### Requirement: 全局工具状态缓存
系统 SHALL 在后端进程中缓存全局工具启用状态，避免每次 agent 调用都查 DB。

#### Scenario: 缓存命中
- **WHEN** 短时间内多次调用 `get_tools()`
- **THEN** 系统 SHALL 从内存缓存返回全局工具状态，不重复查 DB

#### Scenario: Admin 修改后缓存失效
- **WHEN** Admin 通过 API 修改工具启用状态
- **THEN** 系统 SHALL 立即清除缓存，下次 `get_tools()` 从 DB 重新加载

### Requirement: 普通用户获取全局启用工具列表
系统 SHALL 提供 `GET /tools/enabled` 端点（无需 admin 权限），返回当前全局启用的工具名列表。

#### Scenario: 获取启用列表
- **WHEN** 桌面端调用 `GET /tools/enabled`
- **THEN** 系统 SHALL 返回所有 `enabled=True` 的工具名数组（含 tool_configs 中未出现但默认启用的工具）
