## 1. 后端：移除旧 Skill 系统

- [x] 1.1 删除 `backend/app/models/skill.py` 文件
- [x] 1.2 删除 `backend/app/schemas/skill.py` 文件
- [x] 1.3 删除 `backend/app/api/skills.py` 文件
- [x] 1.4 从 `backend/app/api/router.py` 中移除 skills 路由注册
- [x] 1.5 从 `backend/app/startup.py` 中移除 `_seed_builtin_skills()` 及其调用
- [x] 1.6 从 `backend/app/models/__init__.py` 中移除 Skill 导出
- [x] 1.7 从 `backend/app/schemas/__init__.py` 中移除 Skill 相关导出

## 2. 后端：AgentState 和 prepare 节点改造

- [x] 2.1 从 `backend/app/services/agent/state.py` 的 AgentState 中移除 `skill`、`skill_id` 字段
- [x] 2.2 从 `backend/app/services/agent/nodes.py` 的 prepare 节点中移除 Skill 加载逻辑（DB 查询 Skill、读取 skill.system_prompt）
- [x] 2.3 从 `backend/app/services/agent/nodes.py` 中移除 `from app.models.skill import Skill` 及相关引用
- [x] 2.4 从 `backend/app/api/ws.py` WebSocket message 处理中移除 `skill_id` 参数传递

## 3. 后端：skill_loader 模块

- [x] 3.1 创建 `backend/app/services/skill_loader.py`，实现 `SkillMeta` 数据类（name, description, triggers, requires_tools, author, version, path）
- [x] 3.2 实现 `scan_skills(skills_dir)` 函数：遍历目录、解析 YAML Frontmatter、校验 requires_tools、缓存结果
- [x] 3.3 实现 `build_available_skills_prompt(allowed_tools)` 函数：根据 allowed_tools 过滤 Skill，生成 `<available_skills>` XML 字符串
- [x] 3.4 实现 `read_skill_content(skill_name, file)` 函数：安全校验 + 读取文件内容
- [x] 3.5 在 `backend/app/startup.py` 的 `on_startup` 中调用 `scan_skills()` 初始化缓存

## 4. 后端：read_skill 服务端工具

- [x] 4.1 在 `backend/app/services/tools/definitions.py` 的 TOOL_DEFINITIONS 中添加 `read_skill` 工具定义（参数 skill: string 必须, file: string 可选）
- [x] 4.2 在 `backend/app/services/tools/server_tools.py` 中实现 `read_skill` 的执行逻辑，调用 `skill_loader.read_skill_content()`
- [x] 4.3 添加安全校验：skill 名称正则 `[a-z0-9_-]+`、file 路径禁止 `..`、绝对路径必须在 skills/<name>/ 下

## 5. 后端：System Prompt 改造

- [ ] 5.1 在 `backend/app/services/agent/context.py` 中新增 `_SKILL_SYSTEM_RULES` 常量（技能系统使用规则文本）
- [ ] 5.2 修改 `build_system_prompt()` 函数：接收 `allowed_tools` 参数，调用 `build_available_skills_prompt()` 生成技能快照并拼接到系统提示中
- [ ] 5.3 修改 prepare 节点中 `build_system_prompt` 的调用，传入 `allowed_tools`（来自 state）

## 6. 内置 SKILL.md 文件

- [ ] 6.1 创建 `backend/skills/` 目录结构
- [ ] 6.2 编写 `backend/skills/get-weather/SKILL.md`（天气查询：fetch_url）
- [ ] 6.3 编写 `backend/skills/summarize-webpage/SKILL.md`（网页总结：fetch_url）
- [ ] 6.4 编写 `backend/skills/chart-analysis/SKILL.md`（图表分析：python_repl）
- [ ] 6.5 编写 `backend/skills/code-review/SKILL.md`（代码审查：file_read）

## 7. 前端：移除 Skill 相关 UI

- [ ] 7.1 移除 `desktop/src/components/Skills/` 目录（如存在 Skill 选择器组件）
- [ ] 7.2 从 Chat 输入区域移除 Skill 选择器的引用和渲染
- [ ] 7.3 从 Zustand store 中移除 skill 相关状态和 action
- [ ] 7.4 从 WebSocket 消息发送逻辑中移除 `skill_id` 字段

## 8. 数据库迁移

- [ ] 8.1 删除 `sessions` 表的 `skill_id` 列
- [ ] 8.2 删除 `skills` 表

## 9. 验证与清理

- [ ] 9.1 启动后端确认 scan_skills 正常加载所有内置 SKILL.md
- [ ] 9.2 通过 WebSocket 发送消息，确认 System Prompt 中包含 `<available_skills>` 块
- [ ] 9.3 测试 Agent 对天气类请求自动调用 read_skill → fetch_url 的完整链路
- [ ] 9.4 测试 read_skill 路径遍历防护（`..` 和非法字符）
- [ ] 9.5 测试 allowed_tools 过滤——禁用 fetch_url 后确认 get-weather 不出现在可用技能中
