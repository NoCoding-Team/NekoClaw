# memory-files-api

服务端记忆文件 REST API——提供记忆文件的列表、读取和写入端点，供前端通过 HTTP 访问用户的记忆文件。

---

## Overview

在桌面端服务优先架构下，记忆文件的管理统一通过服务端 REST API 进行，替代原有的 Electron IPC 本地访问路径。前端通过 `/api/memory/files*` 端点读写用户记忆文件，服务端负责路径安全校验、目录创建和索引更新。

---

## Requirements

### Requirement: 记忆文件列表 API
系统 SHALL 提供 `GET /api/memory/files` 端点，递归返回当前用户的记忆目录下所有 `.md` 文件列表，包括子目录。

#### Scenario: 列出所有记忆文件（含子目录）
- **WHEN** 已认证用户调用 `GET /api/memory/files`
- **THEN** 系统 SHALL 递归扫描用户记忆目录，返回 JSON 数组，每个元素包含 `name`（相对路径，如 `notes/2026-04-24.md`）和 `modifiedAt`（修改时间戳），仅包含 `.md` 后缀的文件

#### Scenario: 目录不存在时返回空列表
- **WHEN** 用户的记忆目录 `{MEMORY_FILES_DIR}/{user_id}/` 不存在
- **THEN** 系统 SHALL 返回空数组 `[]`，不报错

### Requirement: 记忆文件读取 API
系统 SHALL 提供记忆文件读取端点，支持子目录路径。

#### Scenario: 读取子目录中的文件
- **WHEN** 已认证用户请求读取 `notes/2026-04-24.md`
- **THEN** 系统 SHALL 返回 `{MEMORY_FILES_DIR}/{user_id}/notes/2026-04-24.md` 的内容

#### Scenario: 路径遍历防护
- **WHEN** 请求路径包含 `..`
- **THEN** 系统 SHALL 返回 HTTP 400 错误，拒绝访问

#### Scenario: 仅允许白名单子目录
- **WHEN** 请求路径包含 `/` 且子目录前缀不在白名单（`notes`）中
- **THEN** 系统 SHALL 返回 HTTP 400 错误

### Requirement: 记忆文件写入 API
系统 SHALL 提供记忆文件写入端点，支持子目录路径。

#### Scenario: 写入子目录文件
- **WHEN** 已认证用户写入 `notes/2026-04-24.md`
- **THEN** 系统 SHALL 将内容写入 `{MEMORY_FILES_DIR}/{user_id}/notes/2026-04-24.md`，`notes/` 目录不存在时自动创建

#### Scenario: 写入子目录笔记触发索引更新
- **WHEN** 写入的文件路径匹配 `notes/YYYY-MM-DD.md` 模式
- **THEN** 系统 SHALL 在写入完成后异步调用 `rebuild_memory_index` 更新索引

### Requirement: 记忆文件删除 API
系统 SHALL 支持删除子目录中的记忆文件。

#### Scenario: 删除子目录文件
- **WHEN** 已认证用户请求删除 `notes/2026-04-24.md`
- **THEN** 系统 SHALL 删除 `{MEMORY_FILES_DIR}/{user_id}/notes/2026-04-24.md`

### Requirement: 路径校验规则
REST API 的路径校验 SHALL 允许白名单子目录前缀，禁止其他子目录和路径遍历。

#### Scenario: 允许 notes/ 前缀
- **WHEN** 文件路径为 `notes/2026-04-24.md`
- **THEN** 校验 SHALL 通过

#### Scenario: 禁止非白名单子目录
- **WHEN** 文件路径为 `secrets/password.md`
- **THEN** 校验 SHALL 拒绝并返回 HTTP 400

#### Scenario: 禁止深层嵌套
- **WHEN** 文件路径为 `notes/sub/file.md`
- **THEN** 校验 SHALL 拒绝并返回 HTTP 400

### Requirement: 记忆文件按需内容加载
系统 SHALL 保持记忆文件列表接口轻量化，列表只返回文件元数据，内容仅在用户明确选择或请求文件时加载。

#### Scenario: 列表接口不返回文件内容
- **WHEN** 已认证用户调用 `GET /api/memory/files`
- **THEN** 系统 SHALL 仅返回文件相对路径、修改时间等元数据，MUST NOT 返回文件正文内容

#### Scenario: 选择文件后读取内容
- **WHEN** 用户在记忆面板点击某个记忆文件
- **THEN** 前端 SHALL 调用记忆文件读取接口加载该文件正文

#### Scenario: 每日笔记列表不预读内容
- **WHEN** 记忆目录包含多个 `notes/YYYY-MM-DD.md` 文件
- **THEN** 前端 SHALL 仅展示文件列表，不得为了渲染列表而读取所有每日笔记内容

#### Scenario: 生成今日笔记后按需读取
- **WHEN** 用户手动生成今日笔记并需要展示结果
- **THEN** 前端 SHALL 只读取生成的 `notes/{today}.md` 内容
