## MODIFIED Requirements

### Memory Injection

每次对话开始时，系统 SHALL 读取 Markdown 记忆文件并注入 system prompt，替代原有 DB SELECT + 拼接逻辑。

- 读取 `MEMORY.md`：≤ 4000 字符时全文注入，> 4000 字符时使用 RAG 混合检索（query_hint = 会话标题 + 用户最后一条消息）注入 top-K 相关片段
- 读取今天和昨天的 `memory/YYYY-MM-DD.md`
- 拼接为 `## 长期记忆\n{MEMORY.md 内容/RAG 结果}\n## 近期笔记\n{daily notes 内容}` 注入 system prompt

#### Scenario: Mode A 记忆注入（小记忆）
- **WHEN** 后端 `_build_system_prompt` 构建系统提示且 MEMORY.md ≤ 4000 字符
- **THEN** system prompt SHALL 包含 MEMORY.md 全文内容

#### Scenario: Mode A 记忆注入（大记忆）
- **WHEN** 后端 `_build_system_prompt` 构建系统提示且 MEMORY.md > 4000 字符
- **THEN** system prompt SHALL 包含从记忆索引 RAG 检索返回的相关片段，query 由会话标题和用户最后一条消息拼接

#### Scenario: 记忆文件不存在时
- **WHEN** `MEMORY.md` 或当天每日笔记文件不存在
- **THEN** 系统 SHALL 跳过该文件的注入，不报错

#### Scenario: _load_memory 签名变更
- **WHEN** `build_system_prompt` 调用 `_load_memory`
- **THEN** `_load_memory` SHALL 接受 `query_hint: str = ""` 参数，用于 RAG 检索

### System Prompt Guidance

`_build_system_prompt` 的默认提示词中记忆使用规则 SHALL 采用主动引导策略，明确区分 MEMORY.md、每日笔记和 USER.md 的使用场景。

#### Scenario: 默认模式记忆指引
- **WHEN** 非 Skill 模式构建 system prompt
- **THEN** system prompt SHALL 包含主动引导的记忆使用规则，明确以下行为：
  - 发现用户偏好、重要事实、关键决策时 SHALL 调用 `memory_write` 写入 MEMORY.md
  - 对话产生有价值的要点、结论时 SHALL 调用 `memory_write` 写入当日 YYYY-MM-DD.md
  - 发现用户个人信息（称呼、职业、时区等）时 SHALL 调用 `memory_write` 更新 USER.md
  - 写入前 SHALL 先 `memory_read` 读取已有内容，整合而非简单追加
  - 不 SHALL 包含"每轮最多 N 次"的调用频率限制

### Memory Refresh (Pre-Compaction)

`_memory_refresh` SHALL 引导 LLM 以整合模式维护 MEMORY.md、当日每日笔记和 USER.md。

#### Scenario: Compaction 前记忆刷新
- **WHEN** `total_tokens > context_limit * COMPRESS_RATIO` 触发 compaction
- **THEN** 系统 SHALL 先执行 `_memory_refresh`，静默请求 LLM 调用 `memory_write` 以整合模式保存重要信息

#### Scenario: Refresh Prompt 整合模式
- **WHEN** Memory Refresh 执行时
- **THEN** 发给 LLM 的 prompt SHALL 引导 LLM：
  1. 先 `memory_read("MEMORY.md")`、`memory_read("YYYY-MM-DD.md")`、`memory_read("USER.md")` 读取已有内容
  2. 对 MEMORY.md 执行整合：新信息追加、冲突信息更新、重复信息合并、过时信息删除
  3. 向当日笔记追加对话要点
  4. 发现用户个人信息时更新 USER.md

#### Scenario: 不再限制每会话一次
- **WHEN** 当前会话已经执行过 Memory Refresh
- **THEN** 系统 SHALL 仍允许后续 Memory Refresh 执行（受最小轮次间隔保护约束）

#### Scenario: Memory Refresh 静默执行
- **WHEN** Memory Refresh 执行过程中
- **THEN** 系统 SHALL NOT 向用户 UI 发送可见消息
