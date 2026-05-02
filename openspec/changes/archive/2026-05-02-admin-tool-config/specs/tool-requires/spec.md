## ADDED Requirements

### Requirement: TOOL_DEFINITIONS requires 字段
`TOOL_DEFINITIONS` 中每个工具 SHALL 支持可选的 `requires` 字段，声明其外部依赖。

#### Scenario: 声明凭证依赖
- **WHEN** 工具需要外部 API Key（如 web_search 需要 Tavily API Key）
- **THEN** `requires.credentials` SHALL 为数组，每项包含 `key`（环境变量名）、`label`（显示名）、`hint`（帮助提示）

#### Scenario: 声明服务依赖
- **WHEN** 工具需要外部服务（如 python_repl 需要 Docker）
- **THEN** `requires.services` SHALL 为字符串数组，每项为服务标识（如 `"docker"`）

#### Scenario: 无外部依赖
- **WHEN** 工具无外部依赖（如 read_file、create_file）
- **THEN** `requires` 字段 SHALL 为 None 或省略

### Requirement: requires 字段驱动 Admin UI
Admin 前端 SHALL 根据 `requires` 字段自动生成配置表单，无需硬编码。

#### Scenario: 新增工具自动出现在 Admin
- **WHEN** 开发者在 TOOL_DEFINITIONS 中新增一个工具并声明 `requires.credentials`
- **THEN** Admin 工具管理页面 SHALL 自动展示该工具的凭证配置表单，无需修改前端代码

### Requirement: 服务依赖运行时检测
对于 `requires.services` 中声明的服务，系统 SHALL 提供运行时检测能力。

#### Scenario: Docker 服务检测
- **WHEN** 工具声明 `requires.services: ["docker"]`
- **THEN** 系统 SHALL 通过 Docker API ping 检测 Docker 是否可用，返回 `available: true/false`

#### Scenario: 未知服务类型
- **WHEN** `requires.services` 包含系统不认识的服务标识
- **THEN** 系统 SHALL 返回 `available: false`，附加 `reason: "unknown service"`
