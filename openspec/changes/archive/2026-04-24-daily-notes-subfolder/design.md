## Context

NekoClaw 的记忆系统以 Markdown 文件为载体，存储在 `{MEMORY_FILES_DIR}/{user_id}/` 目录下。当前所有文件（核心人格文件 + 每日笔记）平铺在同一层级。后端有两条链路生成每日笔记：`daily_note_cron`（23:50 cron）和 `memory_refresh`（每 15 轮对话触发 sub-LLM 写入），但在实际运行中未成功创建。

涉及模块：
- **后端**：`services/agent/context.py`（prompt 构建 + memory_refresh）、`services/daily_note.py`、`services/daily_digest.py`、`api/memory.py`（REST API）
- **前端**：`components/Memory/MemoryPanel.tsx`（记忆面板 UI）
- **LLM 工具**：`services/tools/server_tools.py`（memory_write/read 执行）、`services/tools/definitions.py`（工具定义）

## Goals / Non-Goals

**Goals:**
- 每日笔记存入 `notes/` 子目录，核心文件不再被日期文件淹没
- 统一所有路径引用（后端、前端、prompt、cron），不留遗漏
- 修复每日笔记实际未创建的问题
- 兼容迁移已有的根目录日期文件
- REST API 支持子目录文件操作

**Non-Goals:**
- 不改变 MEMORY.md、SOUL.md 等核心文件的存储位置
- 不引入文件版本控制或回滚机制（后续迭代）
- 不改变 `memory_search` 的索引和检索逻辑
- 不改变 daily_digest 的营养价值评估逻辑

## Decisions

### D1: 子目录命名为 `notes/`

选择 `notes/` 而非 `daily/`、`journal/`。

理由：简短、直觉、与 spec 中 "每日笔记" 对应，且未来若支持非日期笔记（如会议笔记）也不冲突。

### D2: REST API 改为递归扫描 + 返回相对路径

`GET /api/memory/files` 从 `os.listdir` 改为递归 `os.walk`，返回结果的 `name` 字段变为相对路径（如 `notes/2026-04-24.md`）。

替代方案考虑：
- 新增 `GET /api/memory/files?dir=notes` 按目录查询 — 多一次请求、前端逻辑更复杂，放弃
- 保持扁平接口 + 新增子目录接口 — 接口膨胀，放弃

路径校验 `_validate_memory_filename` 放开对 `/` 的限制，但仅允许白名单子目录前缀（`notes/`），仍禁止 `..` 遍历。

### D3: 启动时自动迁移 + 启动补生成

在后端 `startup.py` 中增加两步：
1. **迁移**：扫描每个用户目录，将匹配 `YYYY-MM-DD.md` 模式的文件移入 `notes/` 子目录
2. **补生成**：检查昨天是否有对话但无对应笔记，若缺失则触发 `generate_daily_note`

这比写独立迁移脚本更简单，且每次重启自动修复。迁移是幂等操作（已在 `notes/` 里的不再移动）。

### D4: daily_note_cron 容错增强

- 缺失 LLM config 时：从用户绑定的任意可用 LLM config 中选一个（不局限于 `is_default`）
- 查询消息时区：统一使用 UTC，消除服务器本地时间与数据库时区不一致的问题
- 增加结构化日志：每个用户的生成结果（成功/跳过/失败原因）记录到日志

### D5: memory_refresh prompt 路径更新策略

直接修改 `context.py` 中 `memory_refresh` 函数的 prompt 字符串，将 `{today}.md` 改为 `notes/{today}.md`。同时更新 `_TOOL_RULES` 和 `_DEFAULT_AGENTS` 中的路径说明。

对于已存在的用户自定义 AGENTS.md（已持久化到文件），不做自动修改——用户自行维护。只改默认模板。

### D6: 前端 MemoryPanel 分组逻辑调整

文件分组规则：
- **核心文件**（固定置顶）：`SOUL.md`、`USER.md`、`IDENTITY.md`、`AGENTS.md`、`MEMORY.md`、`SKILLS_SNAPSHOT.md`
- **每日笔记**：匹配 `notes/YYYY-MM-DD.md` 路径模式
- **其他**：不在上述两类中的文件

创建今日笔记按钮写入路径从 `{today}.md` 改为 `notes/{today}.md`。

## Risks / Trade-offs

**[R1] 已有用户的 AGENTS.md 中路径过时** → 自动迁移只处理文件位置，不修改用户自定义的 AGENTS.md 内容。如果用户手动编辑过 AGENTS.md 并写了旧路径，LLM 可能仍写到根目录。缓解：memory_refresh prompt 和 _TOOL_RULES（system prompt 中硬编码的部分）会覆盖 AGENTS.md 的指引，优先级更高。

**[R2] API 返回路径格式变更** → `GET /api/memory/files` 的 `name` 字段从 `2026-04-24.md` 变为 `notes/2026-04-24.md`，现有前端需适配。因为前端是同仓库同步发布，风险可控。

**[R3] 迁移期间文件访问竞争** → 启动时迁移与 cron/memory_refresh 可能并发写同一文件。缓解：迁移在 startup 阶段执行，此时 cron 尚未启动，memory_refresh 依赖用户请求触发，启动阶段无用户请求。

**[R4] daily_note_cron 仍可能因服务器长时间宕机而跳过** → 启动补生成只补昨天。如果宕机超过一天，中间的日期不补。可接受，因为没有对话数据的日期也不需要笔记。
