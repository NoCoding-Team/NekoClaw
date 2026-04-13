## MODIFIED Requirements

### Requirement: LLM 调用完成后写入 usage_log
LLM 服务 SHALL 在 `run_llm_pipeline` 函数中，当每次 LLM API 调用完成（streaming done 或 error）后，使用 `asyncio.create_task` 异步写入 usage_log，不阻塞 WebSocket streaming 主流程。写入失败时仅记录 warning，不抛出异常。

#### Scenario: streaming 完成后后台写入日志
- **WHEN** `llm_done` 事件准备发送给 WebSocket 客户端
- **THEN** `asyncio.create_task(_write_usage_log(...))` 被调用，主协程继续返回，不等待写入完成

#### Scenario: LLM 调用异常时也写入日志
- **WHEN** openai SDK 抛出 APIError 或 Timeout
- **THEN** 在 except 块中调用 `asyncio.create_task(_write_usage_log(..., status="error"))`，异常继续向上传播给 WebSocket 错误处理
