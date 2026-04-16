## Context

NekoClaw 有两种 LLM 运行模式：Mode A（服务端 WebSocket 代理）和 Mode B（前端本地直连）。两种模式都面临长对话上下文膨胀问题。

**现状：**
- 后端 `llm.py` 已实现 `_compress_history()`（LLM 摘要压缩）和 `_memory_refresh()`（压缩前记忆保存），但 `_persist_message()` 从未设置 `token_count`，导致触发条件 `sum(token_count) > context_limit * 0.70` 恒为 0，压缩永不触发。
- 前端 `useLocalLLM.ts` 将全部历史消息直接发给 LLM，无 token 计数、无截断、无压缩。
- 工具输出（shell_exec、file_read）在 UI 展示时截断，但发给 LLM 时保留完整内容。

**利益相关方：**
- 用户隐私：消息和记忆明确分离——消息是给用户看的历史记录，记忆是给 LLM 用的持久知识。裁剪和压缩只操作发给 LLM 的内容，不修改持久化存储。
- Mode B 用户：本地小模型上下文窗口通常 8K-32K，对上下文管理需求最迫切。

## Goals / Non-Goals

**Goals:**
- 修复后端 token_count Bug，激活已有压缩流水线
- Mode B 前端新增完整的上下文管理：Session Pruning + Compaction + Memory Refresh
- 后端同样新增 Session Pruning
- 工具输出在发给 LLM 时截断，防止单条消息撑爆上下文
- Agentic loop 增加 mid-loop 安全检查

**Non-Goals:**
- Dreaming / 后台记忆提炼（标记为后续迭代）
- 精确 tokenizer（用字符长度估算即可，中文≈1.5 token/字符、英文≈0.25 token/字符）
- 基于缓存 TTL 的自动剪枝调度（OpenClaw 特有，NekoClaw 不需要）
- 压缩摘要的标识符保留策略

## Decisions

### D1: Token 估算策略

**选择：字符长度 / 系数估算**
- `estimateTokens(text)` = `Math.ceil(text.length * 0.6)` — 中英混合场景下的经验系数
- 前后端共用同一估算函数

**备选方案：**
- tiktoken / 精确 tokenizer：增加依赖包大小（Electron 体积敏感），收益有限
- 按模型区分系数：增加复杂度，精度提升不显著

**理由：** 压缩触发点已有 30% 余量（70% 阈值），估算偏差 ±20% 完全可接受。

### D2: Session Pruning 策略

**选择：三级裁剪**

对发给 LLM 的消息列表，按"距当前轮次的距离"分三级处理 tool_result：

| 距离 | 策略 | 内容 |
|------|------|------|
| 最近 3 轮 | 保留原样 | 完整工具输出 |
| 4-8 轮 | 软裁剪 | 保留首 300 字符 + "...[已裁剪]..." + 尾 200 字符 |
| >8 轮 | 硬清空 | 替换为 `[工具输出已省略]` |

**额外规则：** 任何单条 tool_result 超过 MAX_TOOL_RESULT_TOKENS（默认 4000 字符）的，即使在最近 3 轮内也做软裁剪。

**理由：** 与 OpenClaw 的 soft-trim / hard-clear 二级模型一致，增加中间层更平滑。仅在内存中操作，持久化存储（SQLite/PostgreSQL）不做任何修改。

### D3: Compaction 流水线

**选择：Memory Refresh → LLM 摘要 → 替换旧消息**

**触发条件：** `estimateTokens(所有消息) > contextLimit * 0.70`

**流程：**
1. Memory Refresh：静默调一轮 LLM，让它用 memory_write 保存重要信息（每会话最多一次）
2. 分割历史：保留最近 20 条消息，其余为 to_compress
3. LLM 摘要：将 to_compress 发给 LLM 生成对话摘要
4. 替换：用一条 `[对话历史摘要]\n{summary}` 消息替代 to_compress
5. 持久化摘要：存入 SQLite（compaction_summary 字段）或者作为一条标记为 `role=system` 的消息

**后端复用：** 后端已有此流程，仅需修复 token_count 即可激活。

**前端 Mode B：** 新增 `compactHistory()` 函数实现相同流程，用当前配置的本地 LLM 做摘要。

**备选方案：**
- 简单截断（丢弃旧消息）：信息丢失严重
- 仅靠 Memory Refresh 不压缩：上下文仍然超限

### D4: Mid-loop 安全检查

**选择：每轮工具调用后估算上下文大小**

在 agentic loop 中，每执行完一个 tool_call 后：
1. 估算当前消息列表总 token
2. 若超过 context_limit * 0.85：对历史执行一次 Session Pruning
3. 若仍超 0.90：执行一次 Emergency Compaction（简化版，不做 Memory Refresh）

**理由：** 防止多轮工具调用累积输出撑爆上下文。比 OpenClaw 更激进的阈值（0.85/0.90 vs 仅 0.70），因为 loop 中已无暇做完整 Memory Refresh。

### D5: 工具输出截断（发给 LLM 的）

**选择：在 tool_result 追加到 LLM 消息列表时截断**

- 截断阈值：MAX_TOOL_RESULT_CHARS = 8000 字符
- 截断方式：`result.slice(0, 6000) + "\n...[输出过长已截断]...\n" + result.slice(-1500)`
- 独立于 UI 展示截断（UI 截断 2000 字符不变）

**理由：** 工具输出是上下文膨胀的主因。8000 字符 ≈ 4800 tokens，对单条工具结果是合理上限。

### D6: 前端压缩摘要的持久化

**选择：存为特殊标记的 SQLite 消息记录**

压缩后生成的摘要存为 `role = "system"`, `content = "[对话历史摘要]\n{summary}"` 的消息，原被压缩的消息保留不删（用户仍可看到完整历史），但下次构建上下文时优先使用摘要。

**理由：** 保持消息和记忆的分离——压缩摘要是上下文管理产物，不是记忆内容。用户侧显示完整历史，LLM 侧使用压缩后上下文。

## Risks / Trade-offs

- **[Token 估算不精确]** → 70% 触发阈值留有 30% 余量，即使估算偏差 20% 也有足够缓冲。若发现特定模型误差过大，后续可按 provider 微调系数。
- **[Compaction 摘要质量]** → 依赖 LLM 摘要能力。对于本地小模型（7B-13B），摘要质量可能不如大模型。Mitigation：摘要 prompt 尽量简洁，且保留 20 条最近消息原样。
- **[Memory Refresh 隐性消耗]** → 额外一轮 LLM 调用，对于按 token 计费的 API 用户有成本。Mitigation：每会话最多一次，且仅在压缩前触发。
- **[Mid-loop Emergency Compaction 风险]** → 在工具循环中做压缩可能中断工具上下文。Mitigation：仅做 pruning + 简化压缩，不触发 Memory Refresh；如果工具结果被裁剪，LLM 下一轮可能需要重新调用工具。
- **[前后端逻辑重复]** → Session Pruning 和 token 估算在前后端各实现一次。Mitigation：逻辑简单（< 50 行），且前后端语言不同（TS vs Python），共享代码不现实。
