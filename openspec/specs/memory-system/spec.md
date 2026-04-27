## Requirements

### Requirement: 结构化记忆文档
系统 SHALL 将用户的长期记忆以结构化 Markdown 文档分类存储，分为 user、projects、facts、skills 四类。

#### Scenario: 记忆分类存储
- **WHEN** 系统识别到需要记录的信息
- **THEN** 将信息以原子条目（Markdown 列表项）追加到对应分类文档，条目 SHALL 包含时间戳和来源标注

#### Scenario: 记忆注入上下文
- **WHEN** 用户开始新对话或服务端构建 LLM Prompt
- **THEN** 系统 SHALL 读取所有启用的记忆文档，将相关内容注入系统提示上下文

### Requirement: 记忆存储位置选择
系统 SHALL 允许用户为每条记忆选择「存云端」或「仅本地」，云端记忆跨设备同步，本地记忆仅当前 PC 可见。

#### Scenario: 云端存储记忆
- **WHEN** 用户将记忆标记为「云端」
- **THEN** 记忆存储于服务端数据库，用户在任意 PC 登录后均可访问

#### Scenario: 本地存储记忆
- **WHEN** 用户将记忆标记为「仅本地」
- **THEN** 记忆存储于 PC 端本地文件，不传输到服务端，其他设备不可见

#### Scenario: 本地记忆提示
- **WHEN** 用户查看本地记忆条目
- **THEN** 系统 SHALL 显示明确提示「此记忆仅存储在本机，切换设备后不可用」

### Requirement: 记忆库管理界面
系统 SHALL 提供 PC 端记忆库管理界面，用户可查看、搜索、删除记忆条目。

#### Scenario: 查看记忆列表
- **WHEN** 用户打开记忆库界面
- **THEN** 系统展示按分类组织的记忆条目列表，显示内容摘要、时间、存储位置标签

#### Scenario: 删除记忆条目
- **WHEN** 用户点击删除某条记忆
- **THEN** 系统弹出确认对话框，确认后从对应存储位置删除该条目

### Requirement: 记忆导出与导入
系统 SHALL 支持将记忆导出为本地 MD 文件，并支持从 MD 文件导入记忆。

#### Scenario: 导出记忆
- **WHEN** 用户点击「导出记忆」
- **THEN** 系统将所有记忆文档打包导出为 ZIP 或单个 MD 文件

#### Scenario: 导入记忆
- **WHEN** 用户选择一个 MD 文件导入
- **THEN** 系统解析文件中的条目并追加到对应分类，重复条目（相同内容+时间戳）自动跳过

### Requirement: 会话来源驱动的记忆刷新
系统 SHALL 根据会话来源和记忆策略决定是否执行自动 memory refresh。

#### Scenario: 正常对话允许自动刷新
- **WHEN** 正常用户对话达到 memory refresh 触发条件
- **THEN** 系统 SHALL 按既有触发规则执行记忆整理

#### Scenario: 定时任务会话跳过自动刷新
- **WHEN** 定时任务来源会话达到 memory refresh 触发条件
- **THEN** 系统 SHALL 跳过自动 memory refresh，除非该会话明确允许写入记忆

#### Scenario: 旧会话默认兼容
- **WHEN** 旧会话没有来源或记忆策略字段
- **THEN** 系统 SHALL 将其视为正常用户对话，并使用自动记忆策略

### Requirement: 定时任务内容不进入每日记忆整理
系统 SHALL 避免将默认定时任务输出作为每日笔记和 daily digest 的长期记忆来源。

#### Scenario: 每日笔记生成跳过定时任务会话
- **WHEN** 系统生成每日笔记并查询当天消息
- **THEN** 系统 SHALL 排除默认只读记忆策略的定时任务会话消息

#### Scenario: Daily Digest 跳过临时任务内容
- **WHEN** Daily Digest 评估每日笔记内容
- **THEN** 系统 SHALL 将定时任务临时输出视为低价值内容，不得自动整合到 `MEMORY.md`

#### Scenario: 明确记忆任务可参与整理
- **WHEN** 定时任务明确声明需要写入长期记忆
- **THEN** 系统 SHALL 允许该任务输出参与记忆整理流程
