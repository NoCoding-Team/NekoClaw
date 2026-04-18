## ADDED Requirements

### Requirement: 统一 BaseTool 接口
系统 SHALL 将所有工具（server 和 client）实现为 `langchain_core.tools.BaseTool` 子类，每个工具通过 `_arun()` 异步方法执行。

#### Scenario: Server Tool 直接执行
- **WHEN** LangGraph tools 节点调用 `executor="server"` 的工具（如 `web_search`、`http_request`、`memory_*`）
- **THEN** 对应 BaseTool 子类的 `_arun()` SHALL 直接调用 `execute_server_tool()` 并返回结果

#### Scenario: Client Tool WebSocket 桥接
- **WHEN** LangGraph tools 节点调用 `executor="client"` 的工具（如 `file_read`、`shell_exec`、`browser_*`）
- **THEN** 对应 `ClientToolBridge` 子类的 `_arun()` SHALL 通过 WebSocket 发送 `tool_call` 事件，创建 `asyncio.Future` 等待桌面端返回 `tool_result`

### Requirement: ClientToolBridge WebSocket 桥接
系统 SHALL 实现 `ClientToolBridge(BaseTool)` 基类，封装 WebSocket 工具转发和结果等待逻辑。

#### Scenario: 正常桥接流程
- **WHEN** ClientToolBridge._arun() 被调用
- **THEN** 系统 SHALL 生成唯一 `call_id`，通过 WebSocket 发送 `tool_call` 事件（含 call_id、tool name、args、risk_level），然后 await Future 直到桌面端返回结果

#### Scenario: 桥接超时
- **WHEN** 桌面端 60 秒内未返回 `tool_result`
- **THEN** ClientToolBridge SHALL 抛出 `ToolException` 包含超时错误信息，并通过 WebSocket 推送 `tool_error` 事件

#### Scenario: 桌面端返回错误
- **WHEN** 桌面端返回的 `tool_result` 包含 `error` 字段
- **THEN** ClientToolBridge SHALL 返回错误信息字符串，并通过 WebSocket 推送 `tool_error` 事件

### Requirement: 工具内沙箱前置检查
每个 BaseTool 子类的 `_arun()` 方法 SHALL 在执行前调用 `analyze_risk(tool_name, args)`，根据返回的风险等级决定执行策略。

#### Scenario: DENY 级别拦截
- **WHEN** `analyze_risk()` 返回 DENY
- **THEN** 工具 SHALL 不执行任何操作，返回 `{"error": "Tool call blocked by sandbox: <reason>"}` 并通过 WebSocket 推送 `tool_denied` 事件

#### Scenario: 非 DENY 级别执行
- **WHEN** `analyze_risk()` 返回 HIGH/MEDIUM/LOW
- **THEN** 工具 SHALL 将 risk_level 附加到 WebSocket 事件中，继续执行工具逻辑

### Requirement: 工具结果截断
系统 SHALL 在工具返回结果时执行截断，防止过长的工具输出占满上下文窗口。

#### Scenario: 超长工具输出截断
- **WHEN** 工具执行结果超过 8000 字符
- **THEN** 系统 SHALL 截断为前 6000 字符 + 截断提示 + 后 1500 字符

### Requirement: 工具定义注册
系统 SHALL 提供 `get_tools(allowed_tools, ws, user_id)` 函数，根据工具白名单返回对应的 `BaseTool` 实例列表。

#### Scenario: 技能工具白名单
- **WHEN** 当前技能定义了 `allowed_tools`
- **THEN** `get_tools()` SHALL 仅返回白名单中的工具实例

#### Scenario: 无白名单返回全量
- **WHEN** 没有指定 `allowed_tools`
- **THEN** `get_tools()` SHALL 返回所有已注册工具的实例

### Requirement: WebSocket 连接断开时 Future 清理
系统 SHALL 在 WebSocket 连接断开时清理所有与该会话关联的 pending tool call futures。

#### Scenario: 连接断开清理
- **WHEN** WebSocket 连接断开
- **THEN** 系统 SHALL 取消所有该会话的 pending futures，使 awaiting 的 ClientToolBridge 收到异常而非永久挂起
