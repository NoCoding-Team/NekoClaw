## ADDED Requirements

### Requirement: Daily Digest 定时任务
系统 SHALL 提供一个内置的后台定时任务，每天自动分析前一天的每日笔记并将有价值内容提炼到 MEMORY.md。

#### Scenario: 定时触发
- **WHEN** 系统时间到达每天凌晨 2:00（UTC+8）
- **THEN** 系统 SHALL 扫描所有用户的前一天日报文件（`{yesterday}.md`），对每个有内容的文件触发 Digest 流程

#### Scenario: 日报不存在时跳过
- **WHEN** 某用户的 `{yesterday}.md` 文件不存在或内容为空
- **THEN** 系统 SHALL 跳过该用户，不执行 Digest

### Requirement: 营养价值评估
Digest Agent SHALL 先评估日报的信息价值，仅对有长期记忆价值的内容执行提取。

#### Scenario: 有营养的日报
- **WHEN** sub-LLM 判断日报包含用户偏好变化、重要决策、关键事实或经验教训
- **THEN** sub-LLM SHALL 读取 MEMORY.md，将有价值内容整合到 MEMORY.md（使用整合式写入：去重、更新冲突），然后 memory_write 写回

#### Scenario: 无营养的日报
- **WHEN** sub-LLM 判断日报仅包含一次性问答、临时调试过程、闲聊或已有信息
- **THEN** sub-LLM SHALL 不调用任何写入工具，直接返回"无需更新"

#### Scenario: 日报原文保留
- **WHEN** Digest 流程完成（无论是否提取）
- **THEN** 系统 SHALL 不删除或修改原始 `{yesterday}.md` 文件

### Requirement: Digest LLM 配置
Digest 定时任务 SHALL 使用每个用户的默认 LLM 配置执行 sub-LLM 调用。

#### Scenario: 使用用户默认 LLM
- **WHEN** Digest 任务为某用户执行
- **THEN** 系统 SHALL 从数据库读取该用户的默认 LLM 配置（`is_default=True`），用于 sub-LLM 调用

#### Scenario: 无 LLM 配置时跳过
- **WHEN** 某用户无默认 LLM 配置
- **THEN** 系统 SHALL 跳过该用户的 Digest 流程

### Requirement: 错误隔离
Digest 任务 SHALL 以 best-effort 模式运行，单用户失败不影响其他用户。

#### Scenario: 单用户异常
- **WHEN** 某用户的 Digest 流程发生异常（LLM 调用失败、文件 IO 错误等）
- **THEN** 系统 SHALL 记录错误日志，继续处理下一个用户

#### Scenario: sub-LLM 工具轮次上限
- **WHEN** Digest sub-LLM 调用进行中
- **THEN** 系统 SHALL 限制最多 3 轮工具调用，防止无限循环

### Requirement: 启动注册
Digest 定时任务 SHALL 在应用启动时自动注册，无需用户手动创建。

#### Scenario: 应用启动注册
- **WHEN** 后端应用启动（`startup.py`）
- **THEN** 系统 SHALL 注册 Daily Digest 内置 cron job（`0 18 * * *` UTC，即 UTC+8 凌晨 2:00）
