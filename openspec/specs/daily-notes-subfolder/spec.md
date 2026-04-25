# daily-notes-subfolder

每日笔记子目录——将每日笔记文件从记忆根目录迁移至 `notes/` 子目录，统一路径管理。

---

## Overview

每日笔记文件（`YYYY-MM-DD.md`）统一存储于 `{user_dir}/notes/` 子目录下，路径格式为 `notes/YYYY-MM-DD.md`。系统启动时自动迁移旧根目录文件，前端展示按子目录分组。

---

## Requirements

### Requirement: 每日笔记存储于 notes/ 子目录
系统 SHALL 将每日笔记文件存储于用户记忆目录的 `notes/` 子文件夹下，路径格式为 `notes/YYYY-MM-DD.md`。

#### Scenario: 每日笔记写入子目录
- **WHEN** 系统（cron 或 memory_refresh）生成每日笔记
- **THEN** 文件 SHALL 写入 `{MEMORY_FILES_DIR}/{user_id}/notes/YYYY-MM-DD.md`，`notes/` 目录不存在时自动创建

#### Scenario: 核心文件不受影响
- **WHEN** 系统写入 MEMORY.md、SOUL.md、USER.md、IDENTITY.md、AGENTS.md
- **THEN** 这些文件 SHALL 保持在 `{MEMORY_FILES_DIR}/{user_id}/` 根目录，不移入子目录

#### Scenario: LLM 工具写入每日笔记
- **WHEN** LLM 调用 `memory_write` 工具写入每日笔记
- **THEN** prompt 引导 SHALL 指示路径为 `notes/YYYY-MM-DD.md`

### Requirement: 已有每日笔记自动迁移
系统 SHALL 在启动时将用户记忆根目录下已有的 `YYYY-MM-DD.md` 文件自动迁移到 `notes/` 子目录。

#### Scenario: 启动时迁移根目录日期文件
- **WHEN** 后端服务启动且用户目录根目录存在匹配 `YYYY-MM-DD.md` 模式的文件
- **THEN** 系统 SHALL 将这些文件移入 `notes/` 子目录，保持文件名不变

#### Scenario: 迁移幂等性
- **WHEN** 文件已在 `notes/` 子目录中
- **THEN** 系统 SHALL 跳过该文件，不重复迁移

#### Scenario: notes/ 目录下已有同名文件
- **WHEN** 根目录有 `2026-04-20.md` 且 `notes/2026-04-20.md` 也已存在
- **THEN** 系统 SHALL 跳过该文件的迁移，保留 `notes/` 中的版本，在日志中记录冲突

### Requirement: 前端每日笔记分组展示
MemoryPanel SHALL 将 `notes/` 子目录下的文件归入"每日笔记"分组。

#### Scenario: 识别 notes/ 子目录文件
- **WHEN** `GET /api/memory/files` 返回的文件列表包含 `notes/YYYY-MM-DD.md` 路径
- **THEN** MemoryPanel SHALL 将这些文件归入"每日笔记"分组，按日期倒序排列

#### Scenario: 创建今日笔记
- **WHEN** 用户在 MemoryPanel 点击"新建今日笔记"
- **THEN** 系统 SHALL 写入路径为 `notes/{today}.md`
