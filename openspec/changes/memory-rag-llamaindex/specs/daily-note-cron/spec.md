## ADDED Requirements

### Requirement: 每日定时汇总 Cron
系统 SHALL 在 backend 内置一个 asyncio 定时任务，每日 23:50 自动为当天有对话的用户生成 daily note。

#### Scenario: 定时触发
- **WHEN** 系统时间到达 23:50
- **THEN** cron 任务 SHALL 查询当天有消息记录的所有用户，逐一生成 daily note

#### Scenario: 汇总当天对话
- **WHEN** 为某用户生成 daily note
- **THEN** 系统 SHALL 从 PostgreSQL 查询该用户当天所有 session 的消息，拼接对话文本后调用 LLM 生成 Markdown 格式摘要

#### Scenario: 写入 daily note 文件
- **WHEN** LLM 生成摘要完成
- **THEN** 系统 SHALL 将摘要写入 `data/memory/{user_id}/{date}.md`（如 `2026-04-23.md`），文件已存在时覆盖

#### Scenario: 触发索引重建
- **WHEN** daily note 文件写入完成
- **THEN** 系统 SHALL 触发该文件的增量索引重建（分块 + embedding + 写入 PG memory_vectors）

#### Scenario: 无对话不生成
- **WHEN** 某用户当天没有任何对话消息
- **THEN** 系统 SHALL 跳过该用户，不生成空的 daily note

### Requirement: Cron 生命周期管理
daily_note_cron SHALL 与 FastAPI 应用生命周期绑定。

#### Scenario: 应用启动
- **WHEN** FastAPI 应用启动（lifespan startup）
- **THEN** 系统 SHALL 启动 daily_note_cron asyncio task

#### Scenario: 应用关闭
- **WHEN** FastAPI 应用关闭（lifespan shutdown）
- **THEN** 系统 SHALL 取消 daily_note_cron task，不等待当前执行完成

#### Scenario: 异常恢复
- **WHEN** daily_note_cron 内部发生异常（如 LLM 调用失败）
- **THEN** 系统 SHALL 记录错误日志并继续等待下一次触发，不终止 cron 循环

### Requirement: jieba 预加载
系统 SHALL 在应用启动时预加载 jieba 词典，避免首次搜索延迟。

#### Scenario: 启动预加载
- **WHEN** FastAPI 应用启动
- **THEN** 系统 SHALL 调用 `jieba.initialize()` 预加载词典
