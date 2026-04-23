## Context

当前 NekoClaw 已有 Instruction-Following Skills 系统（2026-04-22 上线），技能以 SKILL.md 文件形式存放在 `backend/skills/`，启动时由 `skill_loader.scan_skills()` 扫描并缓存到内存，通过 `build_available_skills_prompt()` 注入系统提示。但该系统存在以下局限：

- 所有技能全局共享，无多用户隔离
- 全部自动启用，用户无法单独开关
- 无前端管理界面，只能手动操作文件系统
- 无法在线安装/删除用户自定义技能

现有的多用户文件隔离模式已在记忆系统中验证成功（`data/memory/{user_id}/`），可直接复用。

## Goals / Non-Goals

**Goals:**
- 用户可在前端技能库面板浏览所有可用技能（内置 + 自己安装的），查看名称、描述、版本
- 用户可独立开关每个技能（包括内置技能），Agent 只使用 enabled 的技能
- 用户可上传 ZIP 或文件夹安装自定义技能到自己的隔离目录
- 用户可删除自己安装的技能，内置技能不可删除
- 不同用户的技能和配置完全隔离

**Non-Goals:**
- 技能广场/市场（从远程仓库搜索和安装技能）
- SKILL.md 合法性/安全性校验
- 技能版本升级或自动更新
- 技能的在线编辑功能

## Decisions

### D1: 启用状态存储——数据库 `skills_config` 表

**选择**：新建 `skills_config` 表（user_id, skill_name, enabled, source）存储每个用户对每个技能的开关状态。

**备选方案**：
- A) 客户端 localStorage — 无法支持多端同步，且后端 `build_system_prompt` 拿不到状态
- B) JSON 配置文件 — 并发写入风险，缺少事务保证

**理由**：技能启用状态需要在后端 `build_system_prompt` 时实时读取以过滤注入的技能列表，DB 是最自然的选择。表结构轻量，复合主键 `(user_id, skill_name)` 即可。

### D2: 用户技能文件存储——`data/skills/{user_id}/`

**选择**：用户安装的技能文件存放在 `{SKILLS_FILES_DIR}/{user_id}/{skill_name}/`，模式与 `MEMORY_FILES_DIR` 一致。内置技能仍在 `backend/skills/`。

**备选方案**：
- A) 全部放 `backend/skills/` 按子目录区分 — 内置和用户文件混在一起，权限边界不清晰
- B) 技能文件存客户端本地 — Agent 运行在后端无法直接读取

**理由**：复用已验证的 `data/{feature}/{user_id}/` 模式，零学习成本，多用户天然隔离。

### D3: `read_skill` 查找顺序——内置优先

**选择**：`read_skill(skill, file)` 查找顺序为 `backend/skills/{skill}/` → `data/skills/{user_id}/{skill}/`。如果内置和用户目录有同名技能，以内置为准。

**理由**：防止用户技能覆盖内置技能产生安全问题。同名冲突在安装时应阻止。

### D4: 首次登录自动初始化

**选择**：用户首次调用 `GET /api/skills` 时，如果 DB 中该用户无任何记录，自动为所有内置技能创建 `(user_id, name, enabled=true, source="builtin")` 记录。

**备选方案**：在注册时初始化 — 需要改动注册流程，侵入性更大。

**理由**：延迟初始化，不改动注册逻辑，且新增内置技能时旧用户也能自然发现（扫描时对比并补充缺失记录）。

### D5: 上传安装流程——前端打包后端解压

**选择**：前端将文件夹/ZIP 通过 `POST /api/skills/install` (multipart/form-data) 上传到后端，后端解压到 `data/skills/{user_id}/{skill_name}/`，写入 DB 记录。

**理由**：保持后端对文件的完整控制权，`read_skill` 不需要跨进程读取。

### D6: 前端面板——侧边栏新增「技能库」Tab

**选择**：在 Sidebar 的 `PANEL_ITEMS` 中新增 `{ id: 'skills', icon: '🧩', label: '技能库' }`，对应新组件 `SkillsPanel`，卡片网格布局，每个卡片含名称、描述、版本、来源标签、开关/删除按钮。

**理由**：与现有能力面板（Abilities）平行独立，语义清晰——能力=工具，技能=工具使用方法。

## Risks / Trade-offs

- **[同名冲突]** 用户上传的技能可能与内置技能同名 → 安装 API 检查冲突并拒绝，返回错误提示
- **[技能缓存一致性]** `skill_loader` 原有的模块级 `_cache` 是全局单例，不支持 per-user → 需要重构缓存结构为 `{user_id: {skill_name: SkillMeta}}`，或改为每次请求动态扫描（性能可接受，技能数量小）
- **[大文件上传]** 用户可能上传过大的 ZIP → 在 API 层设置上传大小限制（如 10MB）
- **[并发初始化]** 两个请求同时触发首次初始化可能重复插入 → 使用 INSERT OR IGNORE / ON CONFLICT DO NOTHING
