## Why

每日笔记（`YYYY-MM-DD.md`）目前与核心人格文件（SOUL.md、USER.md 等）平铺在同一目录下。随着使用天数增长，用户记忆目录将堆满日期文件，核心文件被淹没，维护困难。同时，每日笔记的自动生成链路存在可靠性问题——cron 触发依赖 LLM config 配置、时区对齐、服务器持续运行，当前缺乏容错和可观测手段，导致每日笔记实际未被创建。

## What Changes

- 将每日笔记的存储路径从 `{user_dir}/YYYY-MM-DD.md` 迁移到 `{user_dir}/notes/YYYY-MM-DD.md`
- REST API（`/api/memory/files`）支持递归扫描子目录，路径校验允许 `notes/` 前缀
- LLM 工具提示（`_TOOL_RULES`、`_DEFAULT_AGENTS`）中的每日笔记路径更新为 `notes/YYYY-MM-DD.md`
- `memory_refresh` prompt 中引导 sub-LLM 读写 `notes/{today}.md`
- `daily_note.py` 写入路径改为 `notes/{date}.md`
- `daily_digest.py` 读取路径改为 `notes/{yesterday}.md`
- `_load_memory()` 读今日/昨日笔记路径改为 `notes/` 子目录
- 前端 MemoryPanel 识别 `notes/` 子目录下的文件，归入"每日笔记"分组
- 修复每日笔记 cron 未创建笔记的问题：增加缺失 LLM config 时的 fallback 告警、启动时检查补生成昨日笔记、日志增强
- 兼容迁移：首次启动时自动将根目录下已有的 `YYYY-MM-DD.md` 文件移入 `notes/`

## Capabilities

### New Capabilities
- `daily-notes-subfolder`: 每日笔记子目录存储——将日期文件从用户记忆根目录迁移到 `notes/` 子文件夹，涵盖后端写入/读取路径、REST API、前端展示的统一变更
- `daily-notes-reliability`: 每日笔记生成可靠性——修复 cron 未触发、LLM config 缺失、时区不一致等问题，增加启动补生成和日志可观测性

### Modified Capabilities
- `active-memory`: memory_refresh prompt 中每日笔记路径从 `YYYY-MM-DD.md` 改为 `notes/YYYY-MM-DD.md`
- `memory-files-api`: REST API 路径校验放开，支持 `notes/` 子目录的列举、读取、写入、删除
- `markdown-memory-files`: 文件存储约定变更，每日笔记从根目录迁入 `notes/` 子目录

## Impact

- **后端**：`daily_note.py`、`daily_digest.py`、`context.py`（`_load_memory`、`memory_refresh`、`_TOOL_RULES`、`_DEFAULT_AGENTS`）、`api/memory.py`（REST 端点）、`server_tools.py`（路径校验无需改动，已支持子目录）
- **前端**：`MemoryPanel.tsx`（文件分组逻辑、创建今日笔记路径）
- **数据迁移**：需要一次性迁移脚本或启动时自动迁移，将已有 `YYYY-MM-DD.md` 移入 `notes/`
- **API 兼容性**：`GET /api/memory/files` 返回结构新增子目录文件，现有客户端需适配文件名含路径前缀
- **Prompt 变更**：所有引导 LLM 写每日笔记的 prompt 路径统一更新，不兼容旧 prompt 缓存
