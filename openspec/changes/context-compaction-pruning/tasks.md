## 1. Token 估算与基础工具

- [x] 1.1 后端 `llm.py` 新增 `estimate_tokens(text: str) -> int` 函数（`math.ceil(len(text) * 0.6)`）
- [x] 1.2 后端 `_persist_message()` 设置 `token_count = estimate_tokens(content)`，修复 token_count 始终为 0 的 Bug
- [x] 1.3 前端 `useLocalLLM.ts` 或新建 `contextUtils.ts` 新增 `estimateTokens(text: string): number` 函数

## 2. 工具输出截断（LLM 上下文）

- [x] 2.1 前端 `localTools.ts` 工具执行结果返回时增加截断：超过 MAX_TOOL_RESULT_CHARS(8000) 则 `首6000 + 截断标记 + 尾1500`
- [x] 2.2 后端 `llm.py` agentic loop 中工具结果追加到消息列表前增加相同截断逻辑

## 3. Session Pruning

- [x] 3.1 前端新增 `pruneToolResults(messages, currentRound)` 函数：按距离分三级裁剪 tool_result（保留/软裁剪/硬清空）
- [x] 3.2 前端 `useLocalLLM.ts` 构建 LLM 请求前调用 `pruneToolResults` 处理历史消息
- [x] 3.3 后端 `llm.py` 新增 `_prune_tool_results(messages)` 函数，与前端相同策略
- [x] 3.4 后端 `run_llm_pipeline` 构建 LLM 消息列表前调用 `_prune_tool_results`

## 4. 前端 Mode B Compaction

- [x] 4.1 前端新增 `memoryRefresh(messages, llmConfig)` 函数：静默调一轮 LLM，让它用 memory_write 保存重要信息，每会话最多一次
- [x] 4.2 前端新增 `compactHistory(messages, llmConfig, contextLimit)` 函数：保留最近 20 条消息，将更早的发给 LLM 生成摘要
- [x] 4.3 前端 `sendMessage` 发送前检测 `estimateTokens(全部消息) > contextLimit * 0.70`，触发 memoryRefresh → compactHistory 流程
- [x] 4.4 压缩摘要持久化到 SQLite：存为 `role=system` 的消息记录，下次加载会话时识别并使用

## 5. Mid-loop 上下文安全检查

- [x] 5.1 前端 agentic loop 每轮工具执行后调用 `estimateTokens` 检查上下文大小
- [x] 5.2 超过 85% 阈值时执行 `pruneToolResults`；仍超 90% 时执行紧急 `compactHistory`（不触发 memoryRefresh）
- [x] 5.3 后端 agentic loop 同样增加 mid-loop 安全检查，策略与前端一致

## 6. 后端 Compaction 验证

- [x] 6.1 验证修复 token_count 后 `_compress_history` 和 `_memory_refresh` 正常触发
- [x] 6.2 后端 agentic loop 增加 mid-loop 上下文安全检查
