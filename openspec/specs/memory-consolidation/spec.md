### Requirement: 整合式记忆刷新
Memory Refresh 的 sub-LLM 调用 SHALL 执行记忆整合而非仅追加，包括去重、冲突消解和过时删除。

#### Scenario: 新信息追加
- **WHEN** sub-LLM 在对话中发现 MEMORY.md 中不存在的新信息
- **THEN** sub-LLM SHALL 将新信息追加到 MEMORY.md 对应分区

#### Scenario: 信息更新（冲突消解）
- **WHEN** sub-LLM 在对话中发现与 MEMORY.md 已有条目冲突的信息（如用户地址变更）
- **THEN** sub-LLM SHALL 就地更新已有条目为新信息，而非追加重复条目

#### Scenario: 重复信息合并
- **WHEN** sub-LLM 发现对话中的信息已在 MEMORY.md 中存在且内容一致
- **THEN** sub-LLM SHALL 跳过该信息，不产生重复条目

#### Scenario: 过时信息删除
- **WHEN** sub-LLM 发现对话中用户明确否定或更正了 MEMORY.md 中的某条信息
- **THEN** sub-LLM SHALL 删除或更新该条目

#### Scenario: 保持分区结构
- **WHEN** sub-LLM 执行 memory_write 写回 MEMORY.md
- **THEN** 输出内容 SHALL 保持 Markdown ## 分区结构（如 ## 偏好、## 事实、## 决策）

### Requirement: USER.md 同步维护
Memory Refresh SHALL 同时引导 sub-LLM 检查是否有用户个人信息需要更新到 USER.md。

#### Scenario: Refresh 时发现用户信息
- **WHEN** sub-LLM 在对话中发现用户的个人信息（称呼、职业、时区等）
- **THEN** sub-LLM SHALL 读取 USER.md 并更新对应字段
