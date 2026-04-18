## 1. 项目基础设施

- [x] 1.1 更新 `requirements.txt`：添加 `langchain-core`、`langchain-openai`、`langchain-anthropic`、`langchain-google-genai`、`langgraph` 依赖
- [x] 1.2 创建 `backend/app/services/agent/` 目录结构：`__init__.py`、`state.py`、`provider.py`、`callbacks.py`、`tools.py`、`context.py`、`nodes.py`、`graph.py`

## 2. Provider 路由层

- [x] 2.1 实现 `provider.py`：`get_chat_model(config: LLMConfig) -> BaseChatModel` 工厂函数，根据 provider 字段返回 ChatOpenAI / ChatAnthropic / ChatGoogleGenerativeAI 实例
- [x] 2.2 实现 API Key 解密集成：在工厂函数中调用 `decrypt_api_key()` 解密 `api_key_encrypted`

## 3. WebSocket 回调处理器

- [x] 3.1 实现 `callbacks.py`：`WebSocketStreamHandler(AsyncCallbackHandler)` 子类
- [x] 3.2 实现 `on_llm_new_token`：推送 `llm_token` 事件到 WebSocket
- [x] 3.3 实现 `on_llm_start`：推送 `llm_thinking` + `cat_state: thinking` 事件
- [x] 3.4 实现 `on_tool_start`：推送 `cat_state: working` 事件
- [x] 3.5 实现错误静默处理：WebSocket 推送失败时不影响主流程

## 4. LangChain 工具层

- [x] 4.1 实现 `tools.py`：为每个 server tool（web_search、http_request、memory_read、memory_write、memory_search）创建 `BaseTool` 子类，`_arun()` 调用 `execute_server_tool()`
- [x] 4.2 实现 `ClientToolBridge(BaseTool)` 基类：封装 WebSocket 转发 + Future 等待逻辑
- [x] 4.3 为每个 client tool（file_read、file_write、file_list、file_delete、shell_exec、browser_navigate、browser_screenshot、browser_click、browser_type）创建 `ClientToolBridge` 子类
- [x] 4.4 在每个 BaseTool._arun() 开头集成沙箱检查：调用 `analyze_risk()`，DENY 返回错误 + 推送 `tool_denied`
- [x] 4.5 实现工具结果截断逻辑：超过 8000 字符时截断（前 6000 + 后 1500）
- [x] 4.6 实现 `get_tools(allowed_tools, ws, user_id)` 函数：根据白名单返回 BaseTool 实例列表

## 5. Agent State 和上下文管理

- [x] 5.1 实现 `state.py`：定义 `AgentState(TypedDict)` 含 messages（add_messages 注解）、session_id、user_id、ws、llm_config、skill、context_limit、user_turn_count
- [x] 5.2 实现 `context.py`：迁移 `_prune_tool_results()` 三级裁剪逻辑
- [x] 5.3 实现 `context.py`：迁移 `_compress_history()` 上下文压缩逻辑（使用 `get_chat_model()` 替代直接 openai 调用）
- [x] 5.4 实现 `context.py`：迁移 `_memory_refresh()` 记忆刷新逻辑（使用 `get_chat_model()` 和 LangChain 工具）
- [x] 5.5 实现 `context.py`：迁移 `_build_system_prompt()` 和 `_load_memory()` 记忆注入逻辑
- [x] 5.6 实现 `context.py`：迁移 `estimate_tokens()` 和刷新间隔保护逻辑（`_can_refresh`、`_mark_refresh_done`）

## 6. LangGraph StateGraph 核心

- [x] 6.1 实现 `nodes.py`：`prepare` 节点 — 加载会话历史、技能、LLM 配置，构建系统提示，执行上下文裁剪和记忆刷新
- [x] 6.2 实现 `nodes.py`：`llm_call` 节点 — 使用 `get_chat_model()` 获取模型，`bind_tools()` 绑定工具，`astream()` 流式调用，通过 callback 推 token
- [x] 6.3 实现 `nodes.py`：`tools` 节点 — 遍历 AIMessage.tool_calls，调用对应 BaseTool._arun()，收集结果，持久化消息，执行 mid-loop 上下文安全检查
- [x] 6.4 实现 `nodes.py`：`finalize` 节点 — 持久化最终 assistant 消息，推送 `cat_state: success` 和 `llm_done`
- [x] 6.5 实现 `graph.py`：定义 StateGraph，添加节点，定义条件边（should_continue），编译图
- [x] 6.6 导出 `run_agent(session_id, user_id, skill_id, ws, ...)` 入口函数，供 ws.py 调用

## 7. WebSocket 层适配

- [x] 7.1 修改 `api/ws.py`：`_handle_message()` 改为调用 `run_agent()` 替代 `run_llm_pipeline()`
- [x] 7.2 修改 `api/ws.py`：连接断开时清理 pending tool call futures
- [x] 7.3 保持 WebSocket 事件协议不变：验证 `llm_token`、`llm_done`、`tool_call`、`tool_result`、`tool_denied`、`server_tool_call`、`server_tool_done`、`cat_state` 事件格式兼容

## 8. 后端清理

- [x] 8.1 删除 `api/llm.py`（enhance 端点）
- [x] 8.2 从 `api/router.py` 移除 llm enhance 路由注册
- [x] 8.3 删除旧 `services/llm.py`（确认所有逻辑已迁移到 `services/agent/` 后）
- [x] 8.4 更新 `services/tools/definitions.py`：保留工具元数据（供 BaseTool 子类引用），移除 `get_openai_tools()` 函数（不再需要手动构建 OpenAI schema）

## 9. 前端瘦身

- [x] 9.1 删除 `desktop/src/hooks/useLocalLLM.ts`
- [x] 9.2 删除 `desktop/src/hooks/localTools.ts`（保留：useWebSocket 仍使用）→ 改为删除 contextUtils.ts
- [x] 9.3 删除 `desktop/src/hooks/toolDefinitions.ts`
- [x] 9.4 精简 `desktop/src/store/app.ts`：移除 `localLLMConfig`、Mode B 相关状态和 persist 逻辑
- [x] 9.5 清理 `desktop/src/api/llmConfigs.ts`：无 enhance 调用，无需修改
- [x] 9.6 更新 Settings 面板组件：移除本地 LLM 配置区域（ModelCenterTab 整体删除）
- [x] 9.7 更新 Chat 组件：移除 Mode B 发送逻辑分支，统一走 WebSocket
- [x] 9.8 清理前端中所有对已删除模块的 import 引用

## 10. 端到端验证

- [ ] 10.1 验证基本对话流程：用户发送消息 → LLM 流式回复 → 消息持久化
- [ ] 10.2 验证 Server Tool 调用：web_search / memory_write 触发和执行
- [ ] 10.3 验证 Client Tool 桥接：file_read / shell_exec 通过 WebSocket 转发到桌面端执行
- [ ] 10.4 验证沙箱拦截：DENY 级别命令被阻止，HIGH 级别附带风险标签
- [ ] 10.5 验证多轮工具调用：LLM 连续调用多个工具后返回最终文本
- [ ] 10.6 验证上下文管理：长对话中 token 裁剪、压缩、记忆刷新正常工作
- [ ] 10.7 验证多 Provider 切换：OpenAI → Anthropic → Gemini 配置切换后对话正常
- [ ] 10.8 验证 WebSocket 断开重连：桌面端断开后 pending futures 被清理，重连后功能恢复
