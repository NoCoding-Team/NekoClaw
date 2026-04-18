## REMOVED Requirements

### Requirement: OpenAI 格式 tool_calls delta 解析
**Reason**: 前端不再直接调用 LLM API，流式 tool_calls 解析移到后端 LangChain 层处理。
**Migration**: 后端使用 `ChatOpenAI.astream()` 自动解析 tool_calls，无需手写 SSE delta 累积逻辑。

### Requirement: Anthropic 格式 tool_use block 解析
**Reason**: 前端不再直接调用 Anthropic API，解析逻辑由 `langchain-anthropic` 内部处理。
**Migration**: 后端使用 `ChatAnthropic.astream()` 自动解析 tool_use blocks。

### Requirement: Agentic Loop
**Reason**: 前端 Agent 循环（useLocalLLM 的 while-loop）由后端 LangGraph StateGraph 取代。
**Migration**: 删除 `useLocalLLM.ts`。Agent 循环逻辑在后端 `services/agent/graph.py` 中通过 StateGraph 节点和条件边实现。

### Requirement: 前端工具定义
**Reason**: 工具定义统一在后端管理，前端不再需要维护 `toolDefinitions.ts`。
**Migration**: 删除 `hooks/toolDefinitions.ts`。
