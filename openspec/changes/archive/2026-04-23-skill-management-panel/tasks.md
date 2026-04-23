## 1. 后端数据模型与配置

- [x] 1.1 在 `app/core/config.py` 的 Settings 中新增 `SKILLS_FILES_DIR: str = "./data/skills"` 配置项
- [x] 1.2 新建 `app/models/skill_config.py`，定义 `SkillConfig` ORM 模型（user_id, skill_name 复合主键, enabled, source, installed_at），继承 BaseModel
- [x] 1.3 在 `app/models/__init__.py` 中导出 SkillConfig
- [x] 1.4 在 `app/startup.py` 的 `create_tables` 中确保 skills_config 表自动创建

## 2. 后端 skill_loader 改造

- [x] 2.1 重构 `scan_skills()` 为 `scan_skills_for_user(user_id)` — 合并扫描 `backend/skills/`（内置）和 `data/skills/{user_id}/`（用户），返回 `dict[str, SkillMeta]`，SkillMeta 新增 `source` 字段（"builtin"/"user"）
- [x] 2.2 新增 `ensure_user_skill_configs(user_id, db_session)` — 查 DB 中该用户记录，对比内置技能目录，补充缺失的 builtin 记录（enabled=true），使用 INSERT OR IGNORE 避免并发冲突
- [x] 2.3 新增 `get_enabled_skills_for_user(user_id, db_session)` — 查 DB 获取 enabled=true 的技能名列表，调用 `scan_skills_for_user` 取元数据，只返回 enabled 且存在文件的技能
- [x] 2.4 改造 `build_available_skills_prompt(user_id, allowed_tools, db_session)` — 从 `get_enabled_skills_for_user` 获取技能列表，再按 allowed_tools 二次过滤
- [x] 2.5 改造 `read_skill_content(skill_name, file, user_id)` — 查找顺序：`backend/skills/{skill_name}/` → `data/skills/{user_id}/{skill_name}/`，保留路径遍历防护

## 3. 后端 API

- [x] 3.1 新建 `app/schemas/skill.py`，定义 `SkillInfo`（name, description, version, author, source, enabled）和 `SkillToggle`（enabled: bool）响应/请求 schema
- [x] 3.2 新建 `app/api/skills.py`，实现 `GET /api/skills` — 调用 ensure_user_skill_configs 确保初始化，返回该用户所有技能列表（内置+用户），含启用状态和元数据
- [x] 3.3 实现 `PUT /api/skills/{name}/toggle` — 更新 skills_config 表中 enabled 字段
- [x] 3.4 实现 `POST /api/skills/install` — 接收 multipart/form-data（ZIP 文件），解压到 `data/skills/{user_id}/{skill_name}/`，校验 SKILL.md 存在，检查同名冲突，写入 DB 记录（enabled=true, source="user"），返回技能元数据
- [x] 3.5 实现 `DELETE /api/skills/{name}` — 校验 source="user"（否则 403），删除文件目录和 DB 记录
- [x] 3.6 在 `app/api/router.py` 中注册 skills router

## 4. 后端 Agent 上下文适配

- [x] 4.1 改造 `services/agent/context.py` 的 `build_system_prompt` — 传递 user_id 和 db_session 给 `build_available_skills_prompt`
- [x] 4.2 改造 `services/tools/server_tools.py` 的 `execute_read_skill` — 接收 user_id 参数，透传给 `read_skill_content`
- [x] 4.3 更新 `execute_server_tool` 中 `read_skill` 分支，透传 user_id

## 5. 前端 API 层

- [x] 5.1 新建 `desktop/src/api/skills.ts`，封装 `fetchSkills()`、`toggleSkill(name, enabled)`、`installSkill(file)`、`deleteSkill(name)` 四个 API 调用

## 6. 前端技能库面板

- [x] 6.1 新建 `desktop/src/components/Skills/SkillsPanel.tsx` — 卡片网格展示所有技能，每张卡片含名称、描述、版本、来源标签（内置/用户）、启用开关
- [x] 6.2 新建 `desktop/src/components/Skills/SkillsPanel.module.css` — 卡片网格样式，与 AbilitiesPanel 风格一致
- [x] 6.3 卡片开关功能：点击开关调用 toggleSkill API，乐观更新 UI
- [x] 6.4 删除功能：用户技能卡片显示删除按钮，确认后调用 deleteSkill API
- [x] 6.5 安装功能：面板顶部「安装技能」按钮，点击后打开文件选择器（支持 .zip），选中后上传调用 installSkill API，成功后刷新列表

## 7. 前端侧边栏集成

- [x] 7.1 在 `Sidebar.tsx` 的 `PANEL_ITEMS` 中新增 `{ id: 'skills', icon: '🧩', label: '技能库' }`
- [x] 7.2 在 `Sidebar.tsx` 的 Tab 类型和面板渲染逻辑中集成 SkillsPanel
- [x] 7.3 更新 `store/app.ts` 的 sidebarTab 类型定义（如需要）
