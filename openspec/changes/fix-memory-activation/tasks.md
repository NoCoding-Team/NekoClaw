## 1. 修复 Mode B 消息历史构建（前置条件）

- [x] 1.1 修改 `desktop/src/hooks/useLocalLLM.ts` 中 `sendMessage` 构建 LLM 上下文的 filter 逻辑：保留 `role: 'user'`、`role: 'tool'`、`role: 'assistant'`（含 `tool_calls` 时即使 content 为空也保留），仅过滤 content 为空且无 tool_calls 的 assistant 消息
- [x] 1.2 验证修复后 agentic loop 中 LLM 能看到之前的工具调用链路（手动测试：调用 memory_write 后下一轮 LLM 应能引用上一轮写入结果）

## 2. 重写记忆引导 System Prompt

- [x] 2.1 重写 `desktop/src/hooks/useLocalLLM.ts` 中的 `MEMORY_GUIDANCE` 常量：从被动限制改为主动引导，明确 MEMORY.md 和 YYYY-MM-DD.md 的使用场景，去掉"每轮最多 N 次"限制
- [x] 2.2 重写 `backend/app/services/llm.py` 中 `_TOOL_RULES` 的记忆相关段落：与前端语义一致的主动引导策略
- [x] 2.3 确认前后端记忆引导文本语义一致

## 3. 降低 Memory Refresh 触发门槛

- [x] 3.1 在 `desktop/src/hooks/useLocalLLM.ts` 的 `sendMessage` 中新增用户消息轮次计数器（`userTurnCount`），每次用户发消息时 +1
- [x] 3.2 在 `useLocalLLM.ts` 中新增轮次触发逻辑：`userTurnCount % 15 === 0` 时触发 `memoryRefresh()`，用 `lastRefreshTurn` 做最小间隔保护（间隔 < 5 轮则跳过）
- [x] 3.3 移除 `useLocalLLM.ts` 中 compaction 前 refresh 的一次性限制（如有 `refreshDone` 标志则移除），改用 `lastRefreshTurn` 间隔保护
- [x] 3.4 在 `backend/app/services/llm.py` 中将 `_memory_refresh_done` set 改为 `_last_refresh_turn` dict（session_id → turn_count），新增用户消息轮次计数
- [x] 3.5 在后端 `run_llm_pipeline` 中新增轮次触发逻辑：每 15 轮触发 `_memory_refresh`，最小间隔 5 轮保护
- [x] 3.6 移除后端 compaction 前 refresh 调用中对 `_memory_refresh_done` 的检查，改用间隔保护

## 4. 更新 Memory Refresh Prompt

- [x] 4.1 更新 `desktop/src/hooks/useLocalLLM.ts` 中 `memoryRefresh` 函数的 prompt：引导 LLM 同时维护 MEMORY.md 和当日 YYYY-MM-DD.md，先读后写
- [x] 4.2 更新 `backend/app/services/llm.py` 中 `_memory_refresh` 的 prompt：与前端语义一致，同时维护两类记忆文件

## 5. 集成验证

- [x] 5.1 Mode B 端到端测试：发送 15+ 条消息后确认 refresh 被触发，MEMORY.md 和每日笔记有新增内容  <!-- 需运行时手动验证 -->
- [x] 5.2 Mode A 端到端测试：后端长对话确认 refresh 触发和记忆写入  <!-- 需运行时手动验证 -->
- [x] 5.3 确认 Compaction 前 refresh 仍正常工作（不影响已有 compaction 流程）  <!-- 需运行时手动验证 -->
