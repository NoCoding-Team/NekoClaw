## Context

NekoClaw 当前后端的 LLM 管道（`services/llm.py`）基于 `openai` Python SDK 手写实现，包含约 650 行代码，涵盖：流式 SSE 解析、Agent while 循环、工具分流（server/client）、上下文裁剪/压缩、记忆注入/刷新等逻辑。前端同时维护 Mode A（WebSocket → 后端 → LLM）和 Mode B（客户端直连 LLM API）两套完整 Agent 循环，Mode B 在 `useLocalLLM.ts` 中用 TypeScript 实现了 OpenAI 和 Anthropic 两套流式解析协议。

核心问题：Agent 循环逻辑重复且脆弱，多 Provider 支持通过 `base_url` hack 实现（把所有模型当 OpenAI 兼容调用），缺乏可观测性、中断/恢复等高级能力。

## Goals / Non-Goals

**Goals:**
- 将后端 Agent 循环迁移到 LangGraph StateGraph，获得结构化状态机、条件路由、可观测性
- 使用 `langchain-openai`/`langchain-anthropic`/`langchain-google-genai` 原生适配器替换 OpenAI SDK 直连
- 统一工具接口为 LangChain `BaseTool` 子类，保留 server tool 直接执行和 client tool WebSocket 桥接的架构
- 废弃 Mode B，所有 LLM 请求统一走后端
- 前端瘦身，删除本地 LLM 调用和工具定义相关代码
- 保持 WebSocket 事件协议向前兼容（`llm_token`、`tool_call`、`tool_result` 等不变）

**Non-Goals:**
- 不迁移数据库 schema 或 ORM（SQLAlchemy model 保持不变）
- 不改变认证机制（JWT 不变）
- 不引入 LangSmith（可观测性作为后续独立 change）
- 不引入 LangGraph 检查点持久化（当前阶段保持内存 state）
- 不实现多 Agent 协作（为后续留接口但不实现）
- 不改变 REST API 端点（除删除 `/api/llm/enhance`）

## Decisions

### Decision 1: LangGraph StateGraph 替代手写 Agent 循环

**选择**: 使用 `langgraph.graph.StateGraph` 定义 Agent 图，包含 `prepare`→`llm_call`→`should_continue`→`tools`→`llm_call` 循环。

**替代方案**:
- **A) 继续手写 while 循环**: 不需要新依赖，但扩展性差、缺乏结构化状态管理。随着上下文管理、记忆刷新、多轮工具调用等逻辑增加，while 循环已超过 300 行且难以测试。
- **B) 使用 LangChain AgentExecutor**: 已被 LangGraph 取代（legacy），且不支持自定义工具节点行为（如 WebSocket 桥接）。

**理由**: StateGraph 提供声明式的节点+边定义，每个节点职责单一、可独立测试。条件路由替代 if/else 嵌套。未来扩展（如人在回路、子图）只需增加节点/边。

### Decision 2: 自定义 BaseTool 子类而非 ToolNode

**选择**: 每个工具实现为 `langchain_core.tools.BaseTool` 子类，在 `_arun()` 方法内完成沙箱检查 + 执行/桥接。不使用 LangGraph 内置的 `ToolNode`，而是自定义 tools 节点遍历 tool calls 并调用对应 tool。

**替代方案**:
- **A) 使用 LangGraph 内置 ToolNode**: 开箱即用但不支持异步 WebSocket 桥接和沙箱前置检查的注入点。
- **B) 沙箱检查放在单独节点**: 增加图复杂度，且需要在 sandbox 和 tools 之间传递状态。

**理由**: 把沙箱检查封装在 tool 内部（`_arun()` 开头调用 `analyze_risk()`），对 LangGraph 透明。Client tool 的 WebSocket 桥接也封装在 tool 内部。统一的 `BaseTool` 接口让 LangGraph 不需感知执行位置差异。

### Decision 3: AsyncCallbackHandler 实现流式推送

**选择**: 实现 `WebSocketStreamHandler(AsyncCallbackHandler)` 用于 LLM token 流式推送和状态事件。

**替代方案**:
- **A) 使用 graph.astream_events()**: LangGraph 的事件流 API。可以工作，但事件粒度和当前 WebSocket 协议不完全对齐，需要额外的事件映射层。
- **B) 手动在 llm_call 节点内解析流**: 回到手写模式，失去 Callback 框架的通用性。

**理由**: Callback Handler 是 LangChain 的标准扩展点，跨 Provider 通用（ChatOpenAI、ChatAnthropic 都触发 `on_llm_new_token`）。可精确控制 WS 事件的时序和内容，与现有前端协议完全兼容。

### Decision 4: Provider 路由工厂函数

**选择**: 实现 `get_chat_model(config: LLMConfig) -> BaseChatModel` 工厂函数，根据 `config.provider` 返回对应的 ChatModel 实例。

```
provider="openai"     → ChatOpenAI(model, api_key, base_url)
provider="anthropic"  → ChatAnthropic(model, api_key)
provider="gemini"     → ChatGoogleGenerativeAI(model, api_key)
provider="custom"     → ChatOpenAI(model, api_key, base_url)  # OpenAI 兼容
```

**理由**: 当前代码用 `AsyncOpenAI(base_url=...)` 把所有 Provider 当 OpenAI 兼容调用，失去了各 Provider 原生特性（如 Anthropic extended thinking, Gemini 多模态）。工厂函数简单且可扩展。

### Decision 5: 保留上下文管理为自定义逻辑

**选择**: 上下文裁剪（`_prune_tool_results`）、压缩（`_compress_history`）、记忆刷新（`_memory_refresh`）保留为自定义实现，放在 `prepare` 节点和 Agent 循环的 mid-loop 检查中。

**替代方案**:
- **A) 使用 LangChain ConversationBufferWindowMemory**: 只做窗口裁剪，不支持 NekoClaw 的三级 tool result 距离裁剪策略。
- **B) 使用 LangGraph checkpointer 做 state 快照**: 不解决上下文 token 超限问题。

**理由**: NekoClaw 的上下文管理策略是定制的（3-tier tool result pruning、70%/85%/90% 阈值、记忆刷新子调用），LangChain 没有等价抽象。这些逻辑保留为 Python 函数，在 prepare 节点和 tools 节点执行后调用。

### Decision 6: 废弃 Mode B，统一走后端

**选择**: 删除前端 `useLocalLLM.ts`、`localTools.ts`、`toolDefinitions.ts`，删除后端 `api/llm.py`（enhance 端点）。所有 LLM 请求通过 WebSocket → 后端 LangGraph Agent 处理。

**理由**: 维护两套 Agent 循环（Python + TypeScript）成本高。统一后端后，工具定义、沙箱规则、记忆注入、上下文管理只需维护一份。用户在服务端配置 LLM，由后端统一调用。

### Decision 7: 后端目录结构

**选择**:
```
backend/app/services/
├── agent/                    # 新建
│   ├── __init__.py
│   ├── graph.py              # StateGraph 定义 + 编译
│   ├── state.py              # AgentState TypedDict
│   ├── nodes.py              # prepare / llm_call / tools / finalize 节点
│   ├── tools.py              # BaseTool 子类（ServerTool + ClientToolBridge）
│   ├── callbacks.py          # WebSocketStreamHandler
│   ├── context.py            # 上下文裁剪/压缩/记忆刷新（从 llm.py 迁移）
│   └── provider.py           # get_chat_model() Provider 路由工厂
├── sandbox.py                # 保留不变
└── tools/
    ├── definitions.py        # 保留工具元数据（name, executor, description, parameters）
    └── server_tools.py       # 保留服务端工具执行逻辑
```

**理由**: 将单个 650 行的 `llm.py` 拆分为职责单一的模块。`services/tools/` 保留是因为工具元数据和服务端执行逻辑仍然需要，`agent/` 目录包含 LangGraph 特有的图定义和节点。

## Risks / Trade-offs

**[LangChain 版本快速迭代]** → 锁定具体版本号（`langchain-core>=0.3,<0.4`），仅依赖 `langchain-core` 和具体 Provider 包，不依赖 `langchain` 全家桶，减少受破坏性变更影响的面积。

**[Client Tool 桥接的并发/超时]** → WebSocket Future 机制已验证可行（当前代码在用），封装到 `ClientToolBridge._arun()` 中后行为不变。需要确保当 LangGraph 图被取消时，pending futures 被正确清理。在 `ws.py` 连接断开回调中清理 `_pending_tool_calls`。

**[上下文管理的节点间状态传递]** → `AgentState` 中包含 `context_limit` 和 `user_turn_count`，mid-loop 检查放在 tools 节点执行后、回到 llm_call 之前。State 是 TypedDict，每次节点返回时更新。

**[前端 Mode B 移除的用户影响]** → 用户自管理的 API Key 将移到服务端配置。前端 Settings 面板替换"本地 LLM 配置"为"服务端 LLM 配置"（通过现有的 `/api/llm-configs` REST API 管理）。已在 Electron safeStorage 中存储的本地 key 不会被自动迁移，用户需要在服务端重新配置。

**[记忆刷新的子 LLM 调用]** → 当前 `_memory_refresh` 运行一个独立的 LLM 对话（非流式、最多 3 轮工具调用）。在 LangGraph 中可以保留为普通 async 函数（不需要子图），在 prepare 节点中调用。使用同一个 `get_chat_model()` 工厂获取模型实例。

**[新增依赖的包大小]** → `langchain-core` + `langgraph` + 3 个 Provider 包。Provider 包底层仍依赖各自的官方 SDK（openai, anthropic, google-generativeai），总依赖增加可控。Docker 镜像大小预估增加 ~50MB。

## Migration Plan

1. **Phase 1 - 后端 LangGraph 核心**: 新建 `services/agent/` 目录，实现 StateGraph + 节点 + 工具。`ws.py` 改为调用新图。保留旧 `services/llm.py` 作为 fallback（可通过环境变量切换）。
2. **Phase 2 - 上下文管理**: 将 pruning/compression/refresh 迁移到新节点，验证长对话行为。
3. **Phase 3 - 多 Provider + 清理**: 添加 Anthropic/Gemini 原生适配器，实现 provider 路由。删除旧 `services/llm.py` 和 `api/llm.py`。
4. **Phase 4 - 前端瘦身**: 删除 Mode B 代码，精简 store 和 Settings UI。

**回滚策略**: Phase 1 中旧代码保留；如果新图出现严重问题，切换环境变量即可回退。Phase 3 之后旧代码删除，回滚需要 git revert。

## Open Questions

- 是否需要为定时任务（Scheduled Tasks）也接入 LangGraph agent？当前定时任务系统是空壳，可以在 LangGraph 迁移后独立实现。
- LangGraph 检查点持久化（如 `langgraph-checkpoint-postgres`）是否在本次 change 中引入？当前决定不引入，后续按需添加。
