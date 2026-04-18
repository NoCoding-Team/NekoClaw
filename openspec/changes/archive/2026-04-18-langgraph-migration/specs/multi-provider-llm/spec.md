## ADDED Requirements

### Requirement: Provider 路由工厂
系统 SHALL 提供 `get_chat_model(config: LLMConfig) -> BaseChatModel` 工厂函数，根据 `LLMConfig.provider` 字段返回对应的 LangChain ChatModel 实例。

#### Scenario: OpenAI Provider
- **WHEN** `config.provider == "openai"`
- **THEN** 工厂 SHALL 返回 `ChatOpenAI` 实例，配置 model、api_key、base_url（如有）、temperature

#### Scenario: Anthropic Provider
- **WHEN** `config.provider == "anthropic"`
- **THEN** 工厂 SHALL 返回 `ChatAnthropic` 实例，配置 model、api_key、temperature

#### Scenario: Gemini Provider
- **WHEN** `config.provider == "gemini"`
- **THEN** 工厂 SHALL 返回 `ChatGoogleGenerativeAI` 实例，配置 model、api_key、temperature

#### Scenario: 自定义 OpenAI 兼容 Provider
- **WHEN** `config.provider == "custom"`
- **THEN** 工厂 SHALL 返回 `ChatOpenAI` 实例，配置 model、api_key、base_url（必填）、temperature

#### Scenario: API Key 解密
- **WHEN** 工厂函数创建 ChatModel 实例
- **THEN** 系统 SHALL 使用 `decrypt_api_key()` 解密 `LLMConfig.api_key_encrypted`，解密后的明文 key 仅在内存中短暂存在

### Requirement: ChatModel 工具绑定
系统 SHALL 使用 ChatModel 的 `bind_tools()` 方法将 LangChain `BaseTool` 列表绑定到模型，替代手动构造 OpenAI function calling schema。

#### Scenario: 工具绑定
- **WHEN** llm_call 节点准备调用 LLM
- **THEN** 系统 SHALL 调用 `model.bind_tools(tools)` 将工具列表绑定，模型自动将工具 schema 转换为各 Provider 原生格式

#### Scenario: 无工具时不绑定
- **WHEN** 工具列表为空
- **THEN** 系统 SHALL 不调用 `bind_tools()`，直接使用原始模型

### Requirement: 流式调用统一接口
系统 SHALL 使用 ChatModel 的 `astream()` 方法进行流式调用，配合 `AsyncCallbackHandler` 处理 token 推送。

#### Scenario: OpenAI 流式调用
- **WHEN** 使用 ChatOpenAI 进行流式调用
- **THEN** `astream()` SHALL 返回 `AIMessageChunk` 序列，callback handler 接收 `on_llm_new_token` 回调

#### Scenario: Anthropic 流式调用
- **WHEN** 使用 ChatAnthropic 进行流式调用
- **THEN** `astream()` SHALL 同样返回 `AIMessageChunk` 序列，callback handler 接收相同格式的回调，无需单独处理

#### Scenario: 工具调用从 AIMessage 提取
- **WHEN** LLM 返回包含工具调用的响应
- **THEN** 系统 SHALL 从 `AIMessage.tool_calls` 属性提取 tool_calls 列表，格式跨 Provider 统一
