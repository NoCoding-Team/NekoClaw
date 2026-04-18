## REMOVED Requirements

### Requirement: Skill 定义模型
**Reason**: 替换为 Instruction-Following Agent Skills 系统。Skill 不再是 DB 配置记录（system_prompt + allowed_tools + sandbox_level），而是 Markdown 教学文档（SKILL.md）。
**Migration**: 删除 `Skill` ORM 模型和 `skills` 数据库表。内置 Skill 预设的能力由 `backend/skills/` 下的 SKILL.md 文件承担。

### Requirement: Skill 管理
**Reason**: DB 层 Skill 的 CRUD 操作不再需要。新系统的技能通过文件系统管理而非 API。
**Migration**: 移除 `/api/skills` 所有端点。用户自定义 Skill 的创建/编辑/删除功能留待后续迭代实现。

### Requirement: Skill 激活与切换
**Reason**: 新系统由 Agent 自动匹配技能，无需用户手动选择。工具权限控制已由 Abilities 面板（toolWhitelist）独立完成。
**Migration**: 移除前端 Skill 选择器组件、`Session.skill_id` 数据库字段、WebSocket 消息中的 `skill_id` 参数。
