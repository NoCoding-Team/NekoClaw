## Why

当前 Instruction-Following Skills 系统缺乏用户管理界面——所有技能硬编码在 `backend/skills/` 目录中，全用户共享、全部自动启用，用户无法浏览、开关、安装或删除技能。需要一个技能库管理面板，让用户可视化管理技能，并支持上传自定义技能实现能力扩展。

## What Changes

- 新增 `SkillConfig` ORM 模型和对应的数据库表 `skills_config`，存储每个用户对每个技能的启用/禁用状态
- 新增用户技能文件存储目录 `data/skills/{user_id}/`，与现有 `data/memory/{user_id}/` 模式一致，实现多用户技能文件隔离
- 新增 `/api/skills` REST API：列出技能、切换启用状态、安装技能（上传 ZIP/文件夹）、删除用户技能
- 改造 `skill_loader`：支持 per-user 技能扫描（内置 + 用户目录合并）、按 DB 启用状态过滤、用户首次登录自动初始化内置技能记录
- 改造 `build_system_prompt` / `build_available_skills_prompt`：只注入当前用户 enabled=true 的技能
- 改造 `read_skill`：透传 user_id，查找顺序为内置目录 → 用户目录
- 前端新增「技能库」侧边栏面板：卡片网格展示所有技能，每个技能可开关；内置技能不可删除，用户技能可删除
- 前端新增技能安装功能：上传文件夹或 ZIP 压缩包安装自定义技能

## Capabilities

### New Capabilities
- `skill-management`: 技能库管理系统，包括 per-user 技能启用状态持久化、用户技能文件存储隔离、技能安装/删除、技能库管理 API 和前端面板

### Modified Capabilities
- `skill-system`: 原有 Instruction-Following Skills 的技能加载和注入逻辑需支持 per-user 过滤和多目录扫描

## Impact

- **后端模型**：新增 `models/skill_config.py`
- **后端 API**：新增 `api/skills.py`，`api/router.py` 注册新路由
- **后端服务**：`services/skill_loader.py` 重构为 per-user 模式；`services/tools/server_tools.py` 的 `read_skill` 分支透传 user_id
- **后端上下文**：`services/agent/context.py` 的 `build_system_prompt` 传递 user_id 给 skill 过滤
- **数据库**：新增 `skills_config` 表（startup.py 自动创建）
- **文件系统**：新增 `data/skills/` 目录用于用户技能存储
- **前端组件**：新增 `components/Skills/SkillsPanel.tsx`
- **前端侧边栏**：`Sidebar.tsx` 新增「技能库」入口
- **前端 API**：新增 `api/skills.ts`
- **配置**：`config.py` 新增 `SKILLS_FILES_DIR` 设置
