## Why

当前 Skill 系统采用 Function-Calling 范式——Skill 是一组「系统提示 + 工具白名单 + 沙盒级别」的 DB 预设，用户手动选择后限制 Agent 的角色和工具范围。这种设计存在三个问题：

1. **能力扩展需要写代码**：新增一项能力（如获取天气、代码审查）必须在后端注册新的 LangChain Tool，涉及代码改动和部署。
2. **与 Abilities 面板职能重叠**：工具权限控制已由前端 Abilities 面板 + toolWhitelist 完成，Skill 的 `allowed_tools` 是冗余的第三层限制，用户产生困惑。
3. **扩展性天花板低**：能力数量受限于硬编码的 Tool 注册量，无法像写文档一样快速扩展。

Instruction-Following Agent Skills 范式将 Skill 从"预设配置"变为"教学文档"——一个 Markdown 文件（SKILL.md）教会 Agent 如何用核心工具完成特定任务，Agent 在运行时自动匹配并阅读说明书后动态执行。写一个 Markdown 文件即可扩展 Agent 能力，无需改代码。

## What Changes

- **BREAKING** 移除现有 Skill 数据模型：删除 `Skill` ORM 模型、`SkillSchema` Pydantic Schema、`/api/skills` CRUD API、`startup.py` 内置 Skill 种子逻辑
- **BREAKING** 移除会话绑定 Skill：删除 `Session.skill_id` 字段、`AgentState.skill` / `AgentState.skill_id`、WebSocket `message.skill_id` 参数
- **BREAKING** 移除前端 Skill 选择器 UI 组件及相关 store 逻辑
- 新增 `backend/skills/` 目录，每个子目录包含一个 `SKILL.md`（YAML Frontmatter + Markdown 操作步骤）
- 新增 `skill_loader` 模块：启动时扫描所有 SKILL.md，解析元数据，生成技能快照
- 新增 `read_skill` 服务端工具，供 Agent 按需读取技能说明及附属资源文件
- 改造 `build_system_prompt`：注入 `<available_skills>` 列表 + 技能系统使用规则，根据用户当前 `allowed_tools` 动态过滤可用技能
- 3-5 个内置 SKILL.md 示范技能（天气查询、网页总结、图表分析等）

## Capabilities

### New Capabilities
- `instruction-following-skills`: 基于 Markdown 教学文档的 Instruction-Following Agent Skills 系统，包括 SKILL.md 规范、加载器、快照生成、read_skill 工具、System Prompt 注入

### Modified Capabilities
- `skill-system`: 原有 Function-Calling Skill 系统的全部需求 **REMOVED**，替换为 instruction-following-skills
- `langgraph-agent`: AgentState 移除 skill/skill_id 字段，prepare 节点移除 Skill 加载逻辑，改为注入 available_skills 快照

## Impact

- **后端代码**：`models/skill.py`、`schemas/skill.py`、`api/skills.py` 整体删除；`services/agent/state.py`、`nodes.py`、`context.py` 修改；`services/tools/definitions.py`、`server_tools.py` 新增 read_skill；`startup.py` 移除 seed 逻辑
- **前端代码**：移除 Skill 选择器组件（`components/Skills/`）、相关 store 状态、Settings 中的 Skill 管理面板；WebSocket message 结构删除 skill_id
- **数据库**：`skills` 表移除，`sessions` 表移除 `skill_id` 列（需 migration）
- **API**：`/api/skills` 全部端点移除（Breaking）
- **文件系统**：新增 `backend/skills/` 目录作为内置技能存放位置
