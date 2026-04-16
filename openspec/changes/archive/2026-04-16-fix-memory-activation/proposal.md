## Why

NekoClaw 的记忆系统框架已经搭好，但实际使用中**记忆几乎不会产生**：长期记忆 MEMORY.md 只有 4 行，每日笔记从未自动创建过。根本原因有四个：

1. **Mode B 工具消息被完全过滤**——`useLocalLLM` 构建历史时丢弃所有 `role: 'tool'` 和带 `tool_calls` 的 assistant 消息，LLM 看不到之前的工具调用链路，无法学会"我应该主动调用记忆工具"
2. **System Prompt 记忆引导过于被动**——规则以限制（"不要保存临时信息""每轮最多3次"）为主调，LLM 默认选择"不写"
3. **Memory Refresh 触发门槛过高**——需要 70% 上下文 + 10 条消息 + 每 session 仅 1 次，128K 模型下约需 90K token 才触发，正常对话几乎永远达不到
4. **每日笔记没有自动产生路径**——只有用户手动点按钮或 LLM 碰巧调用，两者在实践中都不会发生

## What Changes

- **修复 Mode B 消息历史构建**：保留 tool 消息和带 tool_calls 的 assistant 消息，让 LLM 看到完整的工具调用链路
- **重写记忆引导 System Prompt**：从"可以写记忆"改为"发现重要信息时立即写"，明确区分 MEMORY.md 和每日笔记的使用场景，去掉过度限制
- **降低 Memory Refresh 触发门槛**：引入基于消息轮次的定期触发（每 15 轮）和会话切换/空闲触发，去掉"每 session 仅 1 次"限制
- **Memory Refresh Prompt 引导写每日笔记**：在 refresh 时明确要求 LLM 同时维护 MEMORY.md 和当日 YYYY-MM-DD.md

## Capabilities

### New Capabilities

- `memory-refresh-triggers`: Memory Refresh 多触发源机制——基于轮次、会话切换、空闲检测的触发策略

### Modified Capabilities

- `active-memory`: 修改记忆引导策略——System Prompt 从被动改主动，refresh prompt 增加每日笔记要求
- `local-streaming-tool-calls`: 修复 Mode B 消息历史构建——保留 tool 消息在 LLM 上下文中
- `context-compaction`: 调整 Memory Refresh 触发条件——降低阈值，去掉一次性限制

## Impact

- **前端 `desktop/src/hooks/useLocalLLM.ts`**：消息历史 filter 逻辑重写，新增轮次计数器和空闲检测触发
- **后端 `backend/app/services/llm.py`**：`_memory_refresh` 触发条件改写，`_build_system_prompt` 中记忆引导文本重写，refresh prompt 更新
- **前端 `desktop/src/hooks/useLocalLLM.ts` 中的 `memoryRefresh`**：同步后端逻辑——降低触发门槛，更新 refresh prompt
- **不影响**：数据库 schema、API 接口、记忆面板 UI、嵌入/搜索逻辑
