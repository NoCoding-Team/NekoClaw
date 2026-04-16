# session-pruning

Session 上下文裁剪——按工具输出距当前轮次的距离分级裁剪，减少 LLM 上下文占用。

---

## Overview

构建发给 LLM 的消息列表时，对历史 tool_result 消息按距当前轮次的距离执行三级裁剪（保留/软裁剪/硬清空）。裁剪仅在内存中进行，不修改持久化数据库记录。

---

## Requirements

### 上下文构建时工具输出裁剪

构建发给 LLM 的消息列表时，系统 SHALL 按距当前轮次的距离对 tool_result 消息执行分级裁剪。裁剪仅在内存中进行，SHALL NOT 修改 SQLite 或 PostgreSQL 中的持久化消息记录。

#### Scenario: 最近 3 轮工具输出保留
- **WHEN** 构建上下文时，某条 tool_result 消息属于最近 3 轮对话
- **THEN** 系统 SHALL 保留该 tool_result 完整内容（除非超过 MAX_TOOL_RESULT_CHARS）

#### Scenario: 4-8 轮前工具输出软裁剪
- **WHEN** 构建上下文时，某条 tool_result 消息属于 4-8 轮前
- **THEN** 系统 SHALL 将其内容替换为 `首300字符 + "...[已裁剪]..." + 尾200字符`

#### Scenario: 超过 8 轮工具输出硬清空
- **WHEN** 构建上下文时，某条 tool_result 消息属于 8 轮以前
- **THEN** 系统 SHALL 将其内容替换为 `[工具输出已省略]`

#### Scenario: 超大工具输出强制软裁剪
- **WHEN** 任何 tool_result 消息内容超过 MAX_TOOL_RESULT_CHARS（默认 8000 字符）
- **THEN** 系统 SHALL 无论轮次距离均执行软裁剪：`首6000字符 + "\n...[输出过长已截断]...\n" + 尾1500字符`

#### Scenario: 裁剪不影响持久化存储
- **WHEN** Session Pruning 对消息执行裁剪
- **THEN** SQLite 和 PostgreSQL 中的原始消息记录 SHALL NOT 被修改，用户查看聊天历史时仍可看到完整内容

### 前端 Mode B Session Pruning

`useLocalLLM.sendMessage` 构建 LLM 请求前 SHALL 对历史消息列表执行 Session Pruning。

#### Scenario: Mode B 构建上下文前裁剪
- **WHEN** Mode B `sendMessage` 准备调用 LLM API
- **THEN** 系统 SHALL 先对历史消息执行 Session Pruning，再将裁剪后的消息列表发给 LLM

### 后端 Session Pruning

后端 `run_llm_pipeline` 构建 LLM 消息列表前 SHALL 对历史消息执行 Session Pruning。

#### Scenario: Mode A 构建上下文前裁剪
- **WHEN** 后端 agentic loop 准备调用 LLM API
- **THEN** 系统 SHALL 先对历史消息中的 tool_result 执行 Session Pruning

---

## Out of Scope

- 对 assistant 消息内容（非工具输出）执行裁剪
- 跨会话的全局工具输出压缩
