## Context

定时任务（`ScheduledTask`）模型已有 `allowed_tools: list[str]` 和 `skill_id: str | None` 字段，但这两个字段目前完全依赖用户在创建表单中手动配置。用户容易忘配（天气任务忘加 `web_search`），或配错，导致 agent 执行时工具不足。

`list_sessions` 当前不做来源过滤，定时任务执行产生的会话（`source='scheduled_task'`）混入猫话录，对话历史体验较差。

现有关键链路：
- `_skill_is_available(meta, allowed_tools)` — 所有 `requires_tools` 都在 `allowed_tools` 里，技能才会注入 system prompt
- `build_available_skills_prompt(user_id, allowed_tools, db)` — 构建技能目录时已按工具过滤
- `get_chat_model(llm_config)` — 复用现有 LLM 实例，推断 API 可以直接复用

## Goals / Non-Goals

**Goals:**
- LLM 分析任务描述 → 返回建议 `allowed_tools` + `skill_id`，前端自动填充
- 执行前 `allowed_tools` 为空时前端弹警告（安全网，非阻断）
- `list_sessions` 默认只返回 `source='chat'` 会话，定时任务会话从猫话录消失

**Non-Goals:**
- 不做自动阻断执行（用户仍可忽略警告继续执行）
- 不改变定时任务会话本身的存储结构
- 不做技能推断的精确度评测或训练

## Decisions

### D1：推断 API 设计 — 独立端点 vs 保存时自动触发

选择**独立端点 + 前端按钮触发**（A2 方案）：
- `POST /api/scheduled-tasks/infer-tools`，body `{ description: str, user_id 由 token 注入 }`
- 返回 `{ allowed_tools: list[str], skill_id: str | None, reasoning: str }`
- 前端"分析工具"按钮点击后调用，结果填入表单字段，用户可手动修改后再保存

**放弃"保存时自动触发"**：透明度差，用户不知道系统改了什么；且 LLM 调用有延迟，影响保存 UX。

### D2：推断逻辑实现 — 结构化输出 vs 自由文本解析

使用**结构化 Prompt + JSON 强制输出**：
```
系统提示：你是工具配置分析器。根据任务描述，从可用工具列表中选择需要的工具，并匹配最合适的技能。
输出严格遵循 JSON 格式：{"allowed_tools": [...], "skill_id": "..." | null, "reasoning": "..."}
```
可用工具列表和可用技能列表在请求时从服务端动态组装（工具名称列表 + skill catalog），避免硬编码。

### D3：sessions 过滤 — query param vs 默认行为

选择**修改默认行为**：`list_sessions` 加 `.where(Session.source == 'chat')` 过滤。

**放弃 query param 方案**（如 `?source=chat`）：猫话录场景永远只需要 chat 会话，加参数是不必要的复杂度；定时任务会话通过"打开会话"按钮直接按 session_id 访问，不依赖 list API。

### D4：执行前警告 — 前端 vs 后端

选择**前端警告**（B1）：
- `executeTask()` 执行前检测 `task.allowed_tools.length === 0`
- 展示 Toast / Modal 提示"此任务未配置工具，可能无法完成，建议先编辑任务添加工具"
- 用户可选择"仍然执行"或"去编辑"，不强制阻断
- 后端不变，保持简单

## Risks / Trade-offs

- **推断精度依赖 LLM**：任务描述模糊时，推断结果可能不准确 → 用户可在填充后手动修改，不强制
- **list_sessions 过滤**：已有定时任务的旧 session 数据中部分 source 可能为 'chat'（如果历史数据写入时未正确设置）→ 不做历史数据修正，仅影响未来会话；旧数据若出现在猫话录属于可接受的过渡状态
- **"打开会话"体验**：定时任务执行历史里的"打开会话"按钮，点击后 session 不在猫话录里 → ChatArea 仍能正常加载内容，视觉上不高亮于列表；可接受，后续可优化为"查看记录"模式

## Open Questions

- 推断 API 是否需要缓存/去重（相同 description 多次点击）？→ 暂不缓存，LLM 调用速度足够
- "打开会话"后定时任务会话是否需要单独的显示区域？→ 不在本 change 范围内
