## ADDED Requirements

### Requirement: 执行前工具配置空警告
系统 SHALL 在执行 `allowed_tools` 为空的定时任务前向用户展示警告提示，但不强制阻断执行。

#### Scenario: allowed_tools 为空时弹出警告
- **WHEN** 用户点击"立即执行"或到点自动触发任务时检测到 `allowed_tools` 为空列表
- **THEN** 前端 SHALL 展示警告提示，告知用户"此任务未配置工具，Agent 可能无法完成任务"，并提供"仍然执行"和"去编辑"两个选项

#### Scenario: 用户选择仍然执行
- **WHEN** 用户在警告对话框中选择"仍然执行"
- **THEN** 系统 SHALL 继续正常执行任务流程

#### Scenario: 用户选择去编辑
- **WHEN** 用户在警告对话框中选择"去编辑"
- **THEN** 系统 SHALL 取消本次执行并跳转到该任务的编辑界面

#### Scenario: 自动触发时的警告处理
- **WHEN** 到点自动触发且 `allowed_tools` 为空
- **THEN** 系统 SHALL 仍然正常执行（自动触发不弹交互对话框），并在执行历史中记录警告标记

### Requirement: 猫话录过滤定时任务会话
`GET /api/sessions` SHALL 默认只返回 `source='chat'` 的会话，定时任务产生的会话不出现在猫话录中。

#### Scenario: 猫话录不含定时任务会话
- **WHEN** 前端加载猫话录会话列表
- **THEN** 返回的会话列表 SHALL 不包含任何 `source='scheduled_task'` 的会话

#### Scenario: 执行历史可直接打开会话
- **WHEN** 用户在定时任务执行历史中点击"打开会话"
- **THEN** 系统 SHALL 直接按 `session_id` 加载该会话内容，不需要该会话出现在猫话录列表中
