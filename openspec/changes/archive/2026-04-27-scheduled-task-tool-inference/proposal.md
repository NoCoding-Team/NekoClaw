## Why

定时任务在创建时工具白名单依赖用户手动配置，容易遗漏（如忘记添加 `web_search`），导致执行时 agent 因工具不足而失败或给出无意义回复。同时定时任务产生的会话混入猫话录，干扰正常对话历史，用户体验较差。

## What Changes

- **新增工具推断 API**：`POST /api/scheduled-tasks/infer-tools`，接收任务描述，调用 LLM 分析并返回建议的 `allowed_tools` 列表和 `skill_id`
- **前端创建表单新增"分析工具"按钮**：点击后自动填充 `allowed_tools` 和 `skill_id`，用户可在保存前修改
- **执行时安全网警告**：执行任务前检测 `allowed_tools` 为空时，向用户展示警告提示，指引其前往编辑任务
- **猫话录过滤**：`GET /api/sessions` 默认只返回 `source='chat'` 的会话；定时任务会话不再出现在猫话录中

## Capabilities

### New Capabilities

- `scheduled-task-tool-inference`: 定时任务工具自动推断——LLM 分析任务描述，返回所需 `allowed_tools` 和匹配的 `skill_id`

### Modified Capabilities

- `scheduled-tasks`: 新增执行前工具配置校验（空 allowed_tools 时警告）；`list_sessions` 过滤掉定时任务来源会话

## Impact

- **后端**：`backend/app/api/sessions.py`（list_sessions 加 source 过滤）、`backend/app/api/scheduled_tasks.py`（新增 infer-tools 端点）
- **前端**：`desktop/src/components/ScheduledTasks/ScheduledTasksPanel.tsx`（创建表单 + 执行警告）、`desktop/src/App.tsx`（拉取 sessions 时无需改动）
- **依赖**：需要调用现有 LLM 配置；推断逻辑复用 `get_chat_model()`
