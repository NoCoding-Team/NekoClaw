## Why

当前定时任务、每日笔记和记忆工具策略的边界不够清晰：周期性任务结果可能被写入长期记忆，每日笔记会被整篇注入正常对话上下文，Agent 也缺少明确的 `memory_search` / `memory_read` / `memory_write` 使用规则。需要收紧记忆策略，避免临时任务污染长期记忆，同时减少上下文负担并让工具调用更自然。

## What Changes

- 定时任务创建的会话 SHALL 标记来源或记忆策略，默认不参与自动长期记忆刷新和每日 digest。
- 每日笔记 SHALL 按需检索/读取，不再默认把今天和昨天的笔记全文注入正常对话系统提示词。
- `memory_search` SHALL 成为查询历史记忆/笔记的默认入口；`memory_read` 仅用于读取明确文件或写入前读取旧内容；`memory_write` 仅用于明确保存或整理后写回。
- 定时任务执行提示词 SHALL 与正常对话区分，明确“这是计划任务结果，不要自动写入长期记忆，除非用户明确要求记住”。
- 记忆刷新、每日笔记生成和每日 digest SHALL 跳过或降权处理来自定时任务的临时执行会话。

## Capabilities

### New Capabilities

### Modified Capabilities
- `scheduled-tasks`: 定时任务执行需要携带来源/记忆策略，并使用独立任务提示词避免污染长期记忆。
- `memory-rag-injection`: 正常对话记忆注入不再默认加载每日笔记全文，改为按需检索相关片段。
- `markdown-memory-files`: 明确每日笔记与长期记忆文件的读写边界和工具选择规则。
- `memory-system`: 调整自动记忆刷新策略，区分正常对话、定时任务和后台整理流程。
- `memory-files-api`: 支持记忆面板按需加载文件内容，列表接口只返回元数据。

## Impact

- 后端 Agent 上下文构建：调整 `_load_memory()` / RAG 注入策略，避免 daily notes 全文默认注入。
- 后端记忆刷新与 digest：根据会话来源或记忆策略跳过定时任务会话。
- 定时任务执行链路：创建会话/发送消息时携带 `source` 或 `memory_policy`，并补充专用系统提示规则。
- 工具定义与系统提示词：细化 `memory_search`、`memory_read`、`memory_write` 的使用时机。
- 前端记忆面板/API：确保列表只加载元数据，点击文件时再加载内容；每日笔记展示走按需加载。
