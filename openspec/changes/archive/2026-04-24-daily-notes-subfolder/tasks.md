## 1. 后端路径常量与 prompt 更新

- [x] 1.1 `context.py`：`_TOOL_RULES` 中每日笔记路径说明从 `YYYY-MM-DD.md` 改为 `notes/YYYY-MM-DD.md`
- [x] 1.2 `context.py`：`_DEFAULT_AGENTS` 模板中每日笔记路径从 `YYYY-MM-DD.md` 改为 `notes/YYYY-MM-DD.md`
- [x] 1.3 `context.py`：`memory_refresh()` prompt 中 `{today}.md` 改为 `notes/{today}.md`
- [x] 1.4 `context.py`：`_load_memory()` 读今日/昨日笔记路径从 `{user_dir}/{date}.md` 改为 `{user_dir}/notes/{date}.md`

## 2. 后端 daily_note.py 路径 + 可靠性修复

- [x] 2.1 `daily_note.py`：`generate_daily_note()` 写入路径从 `{user_dir}/{date}.md` 改为 `{user_dir}/notes/{date}.md`
- [x] 2.2 `daily_note.py`：`_get_summary_llm_config()` 增加 fallback——用户无默认 config 时选取任意可用 config
- [x] 2.3 `daily_note.py`：`daily_note_cron()` 时区统一为 UTC（`datetime.now()` → `datetime.now(timezone.utc)`）
- [x] 2.4 `daily_note.py`：增加结构化日志——每用户记录 status=success/skipped/failed + reason

## 3. 后端 daily_digest.py 路径修复

- [x] 3.1 `daily_digest.py`：`run_daily_digest()` 读取昨日笔记路径从 `{user_dir}/{yesterday}.md` 改为 `{user_dir}/notes/{yesterday}.md`

## 4. REST API 支持子目录

- [x] 4.1 `api/memory.py`：`_validate_memory_filename()` 放开路径校验，允许 `notes/` 前缀，禁止其他子目录和深层嵌套
- [x] 4.2 `api/memory.py`：`list_memory_files()` 从 `os.listdir` 改为 `os.walk` 递归扫描，返回相对路径
- [x] 4.3 `api/memory.py`：`read_memory_file()`、`write_memory_file()`、`delete_memory_file()` 路由支持带 `/` 的路径参数（FastAPI path 参数加 `:path`）
- [x] 4.4 `api/memory.py`：`write_memory_file()` 对 `notes/YYYY-MM-DD.md` 模式触发索引重建

## 5. 启动迁移与补生成

- [x] 5.1 `startup.py`：新增 `_migrate_daily_notes_to_subfolder()` 函数——扫描所有用户目录，将根目录 `YYYY-MM-DD.md` 移入 `notes/`，跳过已存在的同名文件
- [x] 5.2 `startup.py`：新增 `_backfill_yesterday_notes()` 函数——检查昨日有对话的用户是否缺失笔记，缺失则调用 `generate_daily_note`
- [x] 5.3 `startup.py`：在 `on_startup` 中依次调用迁移和补生成（在 cron 启动之前）

## 6. 前端 MemoryPanel 适配

- [x] 6.1 `MemoryPanel.tsx`：文件分组逻辑——"每日笔记"匹配改为 `notes/YYYY-MM-DD.md` 路径模式
- [x] 6.2 `MemoryPanel.tsx`："新建今日笔记"按钮写入路径从 `{today}.md` 改为 `notes/{today}.md`
- [x] 6.3 `MemoryPanel.tsx`：文件列表显示——对 `notes/` 前缀的文件，显示名仅展示日期部分（如 `2026-04-24`）

## 7. server_tools.py 索引触发适配

- [x] 7.1 `server_tools.py`：`execute_memory_write()` 中索引触发正则从 `^\d{4}-\d{2}-\d{2}\.md$` 调整为同时匹配 `^notes/\d{4}-\d{2}-\d{2}\.md$`
