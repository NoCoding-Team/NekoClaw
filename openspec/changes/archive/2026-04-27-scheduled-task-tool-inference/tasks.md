## 1. 后端：猫话录过滤

- [x] 1.1 修改 `backend/app/api/sessions.py` 的 `list_sessions`，在 `.where()` 中加入 `Session.source == 'chat'` 过滤条件

## 2. 后端：工具推断 API

- [x] 2.1 在 `backend/app/api/scheduled_tasks.py` 新增 `POST /infer-tools` 端点，接收 `{ description: str }`
- [x] 2.2 在 `backend/app/services/` 新增 `task_tool_inference.py`，实现 `infer_tools(description, user_id, db)` 函数
- [x] 2.3 在推断函数中动态组装可用工具名称列表（来自 `_TOOL_GROUPS` 常量）和技能目录（调用 `build_available_skills_prompt` 提取 name/triggers/requires_tools）
- [x] 2.4 构造结构化 Prompt，调用 `get_chat_model(llm_config)` 完成推断，强制 JSON 输出 `{ allowed_tools, skill_id, reasoning }`
- [x] 2.5 处理 LLM 不可用或调用失败的情况，返回 HTTP 422 及友好错误信息

## 3. 前端：创建/编辑表单改造

- [x] 3.1 在 `ScheduledTasksPanel.tsx` 任务创建/编辑表单中新增"分析工具"按钮，任务描述为空时禁用
- [x] 3.2 点击按钮后调用 `POST /api/scheduled-tasks/infer-tools`，显示加载态
- [x] 3.3 推断成功后将 `allowed_tools` 和 `skill_id` 填入对应表单字段，并以折叠方式展示 `reasoning`
- [x] 3.4 推断失败时展示 Toast 提示"工具推断失败，请手动配置"

## 4. 前端：执行前警告

- [x] 4.1 在 `executeTask()` 函数中，执行前检测 `task.allowed_tools.length === 0`
- [x] 4.2 检测到空工具时弹出确认对话框，提供"仍然执行"和"去编辑"两个选项
- [x] 4.3 用户选择"去编辑"时取消执行并跳转到该任务的编辑界面
- [x] 4.4 自动触发（非手动点击）场景跳过弹框，直接执行，仅记录警告日志

## 5. 验证

- [ ] 5.1 验证猫话录不含定时任务会话（执行一个定时任务后确认猫话录列表无新增）
- [ ] 5.2 验证推断 API 对天气类任务返回 `web_search` 或 `http_request` 及 `get-weather` skill_id
- [ ] 5.3 验证 allowed_tools 为空时执行前弹出警告对话框
- [ ] 5.4 验证执行历史"打开会话"按钮仍能正常加载会话内容
