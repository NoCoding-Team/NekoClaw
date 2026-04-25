# conversation-compression

对话上下文超限自动压缩——使用 tiktoken 精确计数，超过 50% 阈值时自动压缩前半段对话。

---

## Overview

当对话 token 数超过 LLM context_window 的 50% 时，自动触发压缩流程：先执行 memory_refresh 保存关键信息，再用 LLM 总结前 50% 消息，替换为摘要 SystemMessage，显著降低 token 占用。

---

## Requirements

### Requirement: tiktoken 精确 token 计数
系统 SHALL 使用 tiktoken 库对对话消息进行 token 计数，根据当前 LLM 模型选择编码器。

#### Scenario: GPT-4o 系列编码
- **WHEN** 当前 session 使用的 LLM 模型名包含 "gpt-4o"
- **THEN** 系统 SHALL 使用 o200k_base 编码器计数

#### Scenario: 其他模型 fallback
- **WHEN** 当前 LLM 模型为 Claude、Gemini、DeepSeek 或其他非 OpenAI 模型
- **THEN** 系统 SHALL 使用 cl100k_base 编码器作为通用估算

#### Scenario: 系统提示 token 计数
- **WHEN** 计算可用对话空间时
- **THEN** 系统 SHALL 将 system prompt 的 token 数从 context_window 中扣除

### Requirement: 对话超限自动压缩
系统 SHALL 在对话 token 数超过 context_window 的 50% 时自动触发压缩。

#### Scenario: 触发压缩
- **WHEN** 每次 LLM 调用前，所有消息的 token 总数 > llm_config.context_window * 0.5
- **THEN** 系统 SHALL 执行对话压缩流程

#### Scenario: 压缩前保存记忆
- **WHEN** 压缩流程触发
- **THEN** 系统 SHALL 先执行 memory_refresh 将关键信息写入 MEMORY.md，再执行压缩

#### Scenario: 前半消息 LLM 总结
- **WHEN** 执行压缩
- **THEN** 系统 SHALL 将前 50% 消息（按消息数量）发送给 LLM 生成摘要，摘要替换原始前半消息为一条 SystemMessage

#### Scenario: 压缩后 token 降低
- **WHEN** 压缩完成
- **THEN** 对话 token 数 SHALL 显著低于压缩前（摘要 ~2000 tokens + 后半原文）

#### Scenario: 未超阈值不压缩
- **WHEN** 对话 token 数 ≤ context_window * 0.5
- **THEN** 系统 SHALL 不触发压缩，保持原始消息

### Requirement: context_window 从 LLM 配置读取
系统 SHALL 从当前 session 关联的 LLM 配置中读取 context_window 值。

#### Scenario: 配置中有 context_window
- **WHEN** llm_config 包含 context_window 字段
- **THEN** 系统 SHALL 使用该值作为压缩阈值的基数

#### Scenario: 配置中无 context_window
- **WHEN** llm_config 未设置 context_window
- **THEN** 系统 SHALL 使用默认值 128000 tokens
