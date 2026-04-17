## Why

当前后端的 LLM 管道（`services/llm.py`）基于 `openai` SDK 手写实现，包括流式解析、Agent 循环、多 Provider 适配、上下文管理等大量自定义逻辑。前端同时维护 Mode A（服务端托管）和 Mode B（客户端直连 LLM API）两套完整的 Agent 循环，导致核心逻辑重复、维护成本高。随着工具调用、记忆刷新、上下文压缩等特性不断增加，手写的 while 循环愈发脆弱且难以扩展。迁移到 LangGraph 框架可以获得结构化的状态机 Agent、原生多 Provider 支持、标准化工具接口和可观测性，同时为未来的多 Agent 协作、人在回路（human-in-the-loop）等高级特性打下基础。

## What Changes

- **BREAKING**: 废弃 Mode B（客户端直连 LLM），所有 LLM 请求统一走后端 WebSocket 通道
- **BREAKING**: 删除 `POST /api/llm/enhance` 端点（Mode B 专用的记忆注入接口）
- 后端 Agent 循环从手写 `while True` 迁移到 LangGraph `StateGraph`
- 后端 LLM 调用从 `openai.AsyncOpenAI` 替换为 `langchain-openai` / `langchain-anthropic` / `langchain-google-genai` 原生适配器
- 新增 LangGraph 自定义 `BaseTool` 子类，统一封装 server tool（直接执行）和 client tool（WebSocket 桥接到桌面端）
- 新增 `AsyncCallbackHandler` 实现 LLM token 流式推送到 WebSocket
- 前端删除 `useLocalLLM.ts`、`localTools.ts`、`toolDefinitions.ts`，精简为纯 WebSocket 客户端
- 前端 store 移除 `localLLMConfig`、Mode B 相关状态
- 依赖变更：移除直接 `openai` SDK 依赖，新增 `langchain-core`、`langchain-openai`、`langchain-anthropic`、`langchain-google-genai`、`langgraph`

## Capabilities

### New Capabilities
- `langgraph-agent`: LangGraph StateGraph Agent 核心，包括状态定义、节点（prepare/llm_call/tools/finalize）、条件路由、WebSocket 流式回调
- `langgraph-tool-bridge`: 统一工具接口层，将 server tool 和 client tool（WebSocket 桥接）封装为 LangChain `BaseTool` 子类
- `multi-provider-llm`: 基于 LangChain 适配器的原生多 Provider LLM 路由（OpenAI、Anthropic、Gemini、自定义 OpenAI 兼容端点）

### Modified Capabilities
- `llm-dispatch`: LLM 调用方式从 openai SDK 直连变更为 LangChain ChatModel，Mode B 废弃
- `local-tools`: 客户端工具定义和本地执行逻辑移除（工具定义统一到后端），前端仅保留 IPC 桥接执行能力
- `local-streaming-tool-calls`: 前端本地流式 LLM 调用和工具循环逻辑移除，统一由后端 LangGraph Agent 处理
- `sandbox-guard`: 沙箱检查逻辑不变，但调用入口从 `services/llm.py` 移到 LangGraph Tool._arun() 内部

## Impact

**后端代码**:
- `services/llm.py` → 重写为 LangGraph 图（新建 `services/agent/` 目录）
- `api/llm.py` → 删除（enhance 端点）
- `api/ws.py` → 简化，去掉 agent loop 入口，改为调用 LangGraph graph
- `services/tools/definitions.py` → 重构为 LangChain `BaseTool` 子类
- `services/sandbox.py` → 保留逻辑，调用入口变更

**前端代码**:
- 删除 `hooks/useLocalLLM.ts`、`hooks/localTools.ts`、`hooks/toolDefinitions.ts`
- 删除 `api/llmConfigs.ts` 中 enhance 相关调用
- 精简 `store/app.ts`（移除 localLLMConfig 等 Mode B 状态）
- Settings 面板移除本地 LLM 配置区域

**依赖**:
- `requirements.txt`: 新增 `langchain-core`、`langchain-openai`、`langchain-anthropic`、`langchain-google-genai`、`langgraph`
- `package.json`: 无新增，仅删除相关代码

**API 兼容性**:
- WebSocket 协议事件不变（`llm_token`、`tool_call`、`tool_result` 等保持兼容）
- REST API 仅删除 `/api/llm/enhance`，其余不变
- 数据库 schema 不变
