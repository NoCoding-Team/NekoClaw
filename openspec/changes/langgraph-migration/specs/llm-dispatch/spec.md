## REMOVED Requirements

### Requirement: LLM 双轨调用模式
**Reason**: 废弃 Mode B（用户自定义 API Key，PC 端直连）。所有 LLM 请求统一由后端处理，用户 API Key 在服务端配置和管理。
**Migration**: 用户需将本地配置的 API Key 通过服务端 `/api/llm-configs` 接口重新添加为服务端 LLM 配置。前端移除本地 LLM 配置 UI。

## MODIFIED Requirements

### Requirement: 多模型 LLM 配置
系统 SHALL 允许管理员在服务端配置多个 LLM Provider（OpenAI、Anthropic Claude、Google Gemini 等），用户默认使用服务端配置的模型。用户也可通过 `/api/llm-configs` 接口添加个人 LLM 配置。

#### Scenario: 管理员配置 LLM
- **WHEN** 管理员通过服务端配置接口添加 LLM Provider
- **THEN** 系统保存 Provider 名称、API Key（加密存储）、模型列表、默认模型

#### Scenario: 用户选择模型
- **WHEN** 用户在 PC 端对话界面点击 LLM 切换选项
- **THEN** 系统展示服务端可用模型列表（含管理员全局配置和用户个人配置），用户选择后对当前会话生效

### Requirement: 流式响应推送
系统 SHALL 通过 WebSocket 将 LLM token 逐个推送给 PC 端，实现打字机效果。底层使用 LangChain ChatModel 的 `astream()` 方法和 `AsyncCallbackHandler`。

#### Scenario: 流式 token 推送
- **WHEN** LLM 开始生成响应
- **THEN** 服务端 SHALL 通过 `WebSocketStreamHandler.on_llm_new_token()` 回调推送 `llm_token` 事件，PC 端收到后实时追加到对话气泡

#### Scenario: 流式结束标记
- **WHEN** LLM 生成完成
- **THEN** 服务端推送 `llm_done` 事件，PC 端停止追加并完成消息渲染

### Requirement: 工具路由
系统 SHALL 通过 LangChain `BaseTool` 子类封装工具执行逻辑。Server 工具在 `_arun()` 中直接执行，Client 工具通过 `ClientToolBridge._arun()` 经 WebSocket 桥接到 PC 端。

#### Scenario: 服务端执行工具
- **WHEN** LLM 调用 `executor: "server"` 的工具（如 web_search、http_request）
- **THEN** 对应 BaseTool 子类 SHALL 直接执行工具，将结果返回给 LangGraph 继续推理

#### Scenario: PC 端执行工具转发
- **WHEN** LLM 调用 `executor: "client"` 的工具（如 file_read、shell_exec、browser_*）
- **THEN** ClientToolBridge SHALL 通过 WebSocket 推送 `tool_call` 事件给 PC 端，await Future 直到 PC 端返回 `tool_result` 后继续推理

#### Scenario: PC 端工具执行超时
- **WHEN** PC 端工具执行超过 60 秒未返回结果
- **THEN** ClientToolBridge SHALL 返回超时错误字符串，并推送 `tool_error` 事件给 PC 端

## REMOVED Requirements

### Requirement: 模式 B 自定义 Key 调用
**Reason**: 被统一后端 LLM 调用模式取代。
**Migration**: 用户自定义 API Key 移到服务端 `/api/llm-configs` 配置。

### Requirement: 模式 B API Key 存储安全
**Reason**: 前端不再直接调用 LLM API，无需本地存储 API Key。
**Migration**: 服务端使用 Fernet 加密存储 API Key。
