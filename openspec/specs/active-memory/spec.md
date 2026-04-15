# active-memory

LLM 主动记忆能力——模仿 OpenClaw `memory_get` / `memory_search` 的工具驱动记忆机制。

---

## Overview

让 LLM 在对话中主动识别值得长期记住的信息，并通过工具调用将其写入记忆库。上下文压缩前自动触发 memory refresh，防止重要上下文因 compaction 丢失。记忆在每次对话开始时注入 system prompt，跨会话持久生效。

---

## Requirements

### Tools

- `R1.1`：新增 `save_memory` server tool，参数：`category`（枚举）、`content`（字符串，≤1000 字符）
- `R1.2`：新增 `update_memory` server tool，参数：`memory_id`（字符串）、`content`（字符串，≤1000 字符）、`category`（可选）
- `R1.3`：`save_memory` 写入前校验：category 必须在白名单 `["preference", "fact", "instruction", "history", "other"]` 内；content 去除首尾空白后不能为空
- `R1.4`：`update_memory` 写入前校验：`memory_id` 必须存在且属于当前 `user_id`，否则返回错误
- `R1.5`：两个工具的 content 写入前做基础 sanitization：去除 ASCII 控制字符（0x00-0x1F，保留 `\n` 和 `\t`）
- `R1.6`：`save_memory` 成功后，更新 `memories.last_used_at = now()`

### Memory Injection

- `R2.1`：`memories` 表新增 `last_used_at TIMESTAMP` 字段，可为 NULL
- `R2.2`：`_load_memory` 查询改为按 `COALESCE(last_used_at, created_at) DESC` 排序，使近期活跃的记忆优先注入
- `R2.3`：`_load_memory` 注入上限保持 50 条，但通过排序确保最相关的优先注入
- `R2.4`：LLM 调用 `save_memory` 或 `update_memory` 后，`last_used_at` 更新，下次对话该条目优先级上升

### System Prompt Guidance

- `R3.1`：`_build_system_prompt` 的默认提示词（非 Skill 模式）新增记忆使用规则段落：

  ```
  ## 记忆使用规则
  当对话中出现以下情况时，主动调用 save_memory 工具：
  - 用户明确要求"记住..."、"下次..."
  - 用户透露持久性偏好（语言偏好、格式要求、工具选择等）
  - 用户提到关于自己的重要长期事实（职业、项目、习惯、位置等）
  - 用户纠正之前的错误信息时，调用 update_memory 修正现有记忆

  不要将以下内容存入记忆：
  - 当前任务的临时细节
  - 本次对话专属的上下文
  - 大段代码或文件内容
  ```

- `R3.2`：Skill 模式下，记忆使用规则不自动注入（由 Skill 的 `system_prompt` 自行控制）

### Memory Refresh (Pre-Compaction)

- `R4.1`：`run_llm_pipeline` 中，当 `total_tokens > context_limit * COMPRESS_RATIO` 时，在调用 `_compress_history` 前先调用 `_memory_refresh`
- `R4.2`：`_memory_refresh` 向 LLM 发送一条静默系统消息（不计入对话历史，不推送 token 到前端）：
  
  ```
  "在我们压缩对话历史前，请检查本次对话中是否有值得长期记住的信息。如果有，现在调用 save_memory 工具保存。如果没有，回复'无需保存'。"
  ```

- `R4.3`：`_memory_refresh` 只执行一轮 LLM 调用；只处理 tool calls（`save_memory` / `update_memory`），忽略文字回复内容
- `R4.4`：`_memory_refresh` 执行期间不向 WebSocket 推送 `llm_token` 事件（静默执行），只推送 tool 执行相关事件
- `R4.5`：`_memory_refresh` 执行失败时静默忽略错误，不阻断后续 compaction 流程
- `R4.6`：每次对话只触发一次 memory refresh（防止 refresh 后 tokens 仍超阈值而死循环）

### Dead Code Removal

- `R5.1`：删除 `MemoryPanel.tsx` 中所有 `LocalMemory` 相关代码：`LocalMemory` interface、`localMemories` state、`localMemPath`、`loadLocalMemories`、`saveLocalMemories`、`handleDeleteLocal`、`handleAddLocal`、`showAddLocal` state、`source` state 中的 `'local'` 选项及对应 UI
- `R5.2`：删除 `MemoryPanel.tsx` 中"仅本机"source tab（保留"全部"和"服务端"两个 tab，或直接去掉 source tab 仅保留 category tab）
- `R5.3`：`nekoBridge.file` 接口保留（本地历史存储仍需使用），但不再引用 `neko_local_memories.json` 路径

---

## Out of Scope

- 语义记忆搜索（`memory_search` 工具，需要 embedding 支持，后续迭代）
- `memory_get` 工具（LLM 主动查询记忆，后续迭代）
- Dreaming sweep（后台记忆提炼，可选实验性功能，后续迭代）
- 记忆去重 / 合并逻辑（当前靠 LLM 自主判断是否重复）
- Skill 模式下的自动记忆注入规则
