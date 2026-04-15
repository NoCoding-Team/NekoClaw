## ADDED Requirements

### Requirement: 多模型 LLM 配置
系统 SHALL 允许管理员在服务端配置多个 LLM Provider（OpenAI、Anthropic Claude、Google Gemini 等），用户默认使用服务端配置的模型。

#### Scenario: 管理员配置 LLM
- **WHEN** 管理员通过服务端配置接口添加 LLM Provider
- **THEN** 系统保存 Provider 名称、API Key（加密存储）、模型列表、默认模型

#### Scenario: 用户选择模型
- **WHEN** 用户在 PC 端对话界面点击 LLM 切换选项
- **THEN** 系统展示服务端可用模型列表，用户选择后对当前会话生效

### Requirement: LLM 双轨调用模式
系统 SHALL 支持两种 LLM 调用模式：模式 A（服务端托管）和模式 B（用户自定义 API Key，PC 端直连）。

#### Scenario: 模式 A 托管调用
- **WHEN** 用户使用服务端配置的 LLM（默认）
- **THEN** 用户消息通过 WebSocket 发往服务端，服务端注入记忆和 Skill 系统提示后调用 LLM，流式响应通过 WebSocket 返回给 PC 端

#### Scenario: 模式 B 自定义 Key 调用
- **WHEN** 用户在 PC 端配置了自己的 API Key 并开启隐私模式
- **THEN** PC 端先向服务端请求记忆注入和沙盒 Prompt，服务端返回增强后的 messages[]，PC 端用自己的 API Key 直接调用 LLM，流式响应由 PC 端渲染，完成后 PC 端将对话摘要同步回服务端记忆库

#### Scenario: 模式 B API Key 存储安全
- **WHEN** 用户输入自定义 API Key
- **THEN** Key MUST 使用 Electron `safeStorage.encryptString()` 加密后存储于本地，不以明文传输到服务端

### Requirement: 流式响应推送
系统 SHALL 通过 WebSocket 将 LLM token 逐个推送给 PC 端，实现打字机效果。

#### Scenario: 流式 token 推送
- **WHEN** LLM 开始生成响应
- **THEN** 服务端 SHALL 通过 WebSocket 推送 `llm_token` 事件，PC 端收到后实时追加到对话气泡

#### Scenario: 流式结束标记
- **WHEN** LLM 生成完成
- **THEN** 服务端推送 `llm_done` 事件，PC 端停止追加并完成消息渲染

### Requirement: 工具路由
系统 SHALL 根据工具定义的 `executor` 字段决定工具调用在服务端还是 PC 端执行。

#### Scenario: 服务端执行工具
- **WHEN** LLM 调用 `executor: "server"` 的工具（如 web_search、http_request）
- **THEN** 服务端直接执行工具，将结果注入 LLM 上下文继续推理

#### Scenario: PC 端执行工具转发
- **WHEN** LLM 调用 `executor: "client"` 的工具（如 file_read、shell_exec、browser_*）
- **THEN** 服务端通过 WebSocket 推送 `tool_call` 事件给 PC 端，等待 PC 端返回 `tool_result` 后继续推理

#### Scenario: PC 端工具执行超时
- **WHEN** PC 端工具执行超过 60 秒未返回结果
- **THEN** 服务端 SHALL 向 LLM 注入超时错误作为工具结果，并推送错误事件给 PC 端
