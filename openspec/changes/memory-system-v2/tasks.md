## 1. 人设文件系统（persona-files）

- [x] 1.1 在 `context.py` 中新增 `_load_persona_file(user_id, filename, default_template)` 函数：若文件不存在则写入默认模板并返回内容，若存在则读取返回（截断 4000 字符上限）
- [x] 1.2 创建 SOUL.md / USER.md / AGENTS.md 三个默认模板常量
- [x] 1.3 重构 `build_system_prompt()`：按 SOUL.md → USER.md → AGENTS.md → 工具声明 → Skills → 记忆注入 的顺序拼接
- [x] 1.4 拆分 `_TOOL_RULES`：将记忆策略、优先级、行为规则移入 AGENTS.md 默认模板，`_TOOL_RULES` 仅保留工具列表、执行环境声明和基本工具使用规则
- [x] 1.5 更新 `_TOOL_RULES` 中记忆规则部分：增加"发现用户个人信息时更新 USER.md"的引导

## 2. MemoryPanel 排序调整（memory-panel-editor）

- [x] 2.1 在 `MemoryPanel.tsx` 中新增 `PIN_ORDER` 权重映射：SOUL.md=0, USER.md=1, AGENTS.md=2, MEMORY.md=3
- [x] 2.2 修改文件列表排序函数：有权重的文件按权重升序，无权重的按修改时间倒序

## 3. 整合式 Memory Refresh（memory-consolidation）

- [x] 3.1 重写 `memory_refresh()` 中的 `refresh_messages` prompt：从"追加而非覆写"改为"整合：新增追加、冲突更新、重复合并、过时删除，保持 ## 分区结构"
- [x] 3.2 在 refresh prompt 中增加读取和整合 USER.md 的指令
- [x] 3.3 将 memory_refresh 的 memory_tool_list 增加对 USER.md 的读写引导（tool list 已包含 memory_read/write，只需 prompt 引导）

## 4. MEMORY.md RAG 检索（memory-rag-injection）

- [x] 4.1 新建 `backend/app/services/memory_index.py`：复用 knowledge.py 的 FTS5 分块逻辑，建立独立 `memory_index.db`（路径 `{STORAGE_ROOT}/{user_id}/memory_index.db`）
- [x] 4.2 实现 `rebuild_memory_index(user_id)` 函数：对 MEMORY.md 分块并写入 FTS5 表，有 embedding 配置时同时写入向量
- [x] 4.3 实现 `search_memory_index(user_id, query, top_k=10)` 函数：FTS5 检索 + 可选向量混合检索，返回相关片段列表
- [x] 4.4 修改 `_load_memory()` 签名为 `_load_memory(user_id, query_hint="")`：≤ 4000 字符全文注入，> 4000 字符调用 `search_memory_index`
- [x] 4.5 修改 `build_system_prompt()` 签名：增加 `query_hint` 参数传递
- [x] 4.6 修改 `prepare()` 节点：构造 query_hint（session.title + 最后一条 HumanMessage content）传入 `build_system_prompt`
- [x] 4.7 在 `execute_memory_write()` 中增加钩子：写入 MEMORY.md 后异步调用 `rebuild_memory_index`

## 5. Daily Digest 定时任务（daily-digest）

- [ ] 5.1 新建 `backend/app/services/daily_digest.py`：实现 `run_daily_digest()` 函数——扫描所有用户的前一天日报，对有内容的执行 sub-LLM Digest
- [ ] 5.2 实现 Digest sub-LLM prompt：评估日报营养价值，有价值则整合到 MEMORY.md（去重/更新），无价值则不调用工具
- [ ] 5.3 在 `startup.py` 中注册 Daily Digest 内置 cron job（`0 18 * * *` UTC，即 UTC+8 凌晨 2:00）
- [ ] 5.4 错误隔离：单用户异常捕获并记日志，不影响其他用户；sub-LLM 最多 3 轮工具调用
