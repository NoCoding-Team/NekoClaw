## ADDED Requirements

### Requirement: LangGraph StateGraph Agent 定义
系统 SHALL 使用 LangGraph `StateGraph` 定义 Agent 执行图，包含以下节点和边：`prepare`（准备上下文）→ `llm_call`（LLM 流式调用）→ `should_continue`（条件路由）→ `tools`（工具执行）→ `llm_call`（循环），或 `should_continue` → `finalize`（结束）。

#### Scenario: 无工具调用的简单对话
- **WHEN** 用户发送消息，LLM 返回纯文本响应（无 tool_calls）
- **THEN** 图的执行路径 SHALL 为 prepare → llm_call → should_continue → finalize，assistant 消息被持久化到数据库

#### Scenario: 单轮工具调用
- **WHEN** LLM 返回包含 tool_calls 的响应
- **THEN** 图的执行路径 SHALL 为 prepare → llm_call → should_continue → tools → llm_call → should_continue → finalize

#### Scenario: 多轮工具调用循环
- **WHEN** LLM 连续多次返回 tool_calls
- **THEN** 系统 SHALL 重复 llm_call → should_continue → tools 循环，直到 LLM 返回无 tool_calls 的响应

### Requirement: AgentState 类型定义
系统 SHALL 定义 `AgentState(TypedDict)` 作为图的状态容器，包含 `messages`（消息列表，使用 `add_messages` 注解实现追加语义）、`session_id`、`user_id`、`ws`（WebSocket 引用）、`llm_config`、`skill`、`context_limit`、`user_turn_count`。

#### Scenario: State 消息追加
- **WHEN** llm_call 节点返回新的 assistant 消息
- **THEN** AgentState.messages SHALL 通过 `add_messages` reducer 追加消息而非覆盖

### Requirement: prepare 节点
`prepare` 节点 SHALL 加载会话历史、构建系统提示（含技能 prompt + 记忆注入 + 工具规则）、执行上下文裁剪和记忆刷新（当满足触发条件时）。

#### Scenario: 首次消息上下文构建
- **WHEN** 会话中第一条消息到达，数据库无历史消息
- **THEN** prepare 节点 SHALL 构建仅含 system prompt 的消息列表

#### Scenario: 记忆注入到系统提示
- **WHEN** 用户有记忆文件（MEMORY.md 和/或每日笔记）
- **THEN** prepare 节点 SHALL 将记忆内容注入到系统提示的末尾

#### Scenario: 上下文超 70% 触发记忆刷新
- **WHEN** 历史消息总 token 数超过 context_limit 的 70%
- **THEN** prepare 节点 SHALL 执行记忆刷新（让 LLM 分析最近 20 条消息并保存关键信息），然后压缩历史

### Requirement: llm_call 节点
`llm_call` 节点 SHALL 使用 LangChain ChatModel 的 `astream()` 方法流式调用 LLM，通过 `WebSocketStreamHandler` 回调将 token 推送到 WebSocket。

#### Scenario: 流式 token 推送
- **WHEN** LLM 开始生成响应
- **THEN** llm_call 节点 SHALL 通过 WebSocket 推送 `llm_thinking` 事件，随后逐 token 推送 `llm_token` 事件，最后推送 `llm_done` 事件

#### Scenario: LLM 未配置
- **WHEN** 用户没有可用的 LLM 配置
- **THEN** llm_call 节点 SHALL 返回错误提示消息，不发起 LLM 调用

### Requirement: tools 节点
`tools` 节点 SHALL 遍历 LLM 返回的 tool_calls，对每个调用执行沙箱检查，然后根据工具类型（server/client）执行或桥接。

#### Scenario: 工具执行后消息持久化
- **WHEN** 工具执行完成
- **THEN** tools 节点 SHALL 将 assistant 消息（含 tool_calls）和每个工具结果消息持久化到数据库

#### Scenario: tools 节点执行后上下文安全检查
- **WHEN** tools 节点完成一轮所有工具调用
- **THEN** 系统 SHALL 估算当前消息总 token 数，若超过 85% 执行 pruning，若仍超 90% 执行紧急 compaction

### Requirement: finalize 节点
`finalize` 节点 SHALL 持久化最终 assistant 消息到数据库并推送 `cat_state: "success"` 事件。

#### Scenario: 成功结束
- **WHEN** LLM 返回无 tool_calls 的最终响应
- **THEN** finalize 节点 SHALL 保存消息并推送成功状态

### Requirement: WebSocketStreamHandler 回调
系统 SHALL 实现 `AsyncCallbackHandler` 子类，在 `on_llm_new_token` 中推送 `llm_token` 事件，在 `on_llm_start` 中推送 `llm_thinking` + `cat_state: thinking` 事件，在 `on_tool_start` 中推送 `cat_state: working` 事件。

#### Scenario: 回调跨 Provider 通用
- **WHEN** 使用 ChatOpenAI 或 ChatAnthropic
- **THEN** WebSocketStreamHandler SHALL 统一接收 `on_llm_new_token` 回调，无需区分 Provider

#### Scenario: 回调不阻塞主流程
- **WHEN** WebSocket 推送失败（如连接已断开）
- **THEN** 回调 SHALL 静默忽略错误，不影响 LLM 响应收集
