# memory-files-api

服务端记忆文件 REST API——提供记忆文件的列表、读取和写入端点，供前端通过 HTTP 访问用户的记忆文件。

---

## Overview

在桌面端服务优先架构下，记忆文件的管理统一通过服务端 REST API 进行，替代原有的 Electron IPC 本地访问路径。前端通过 `/api/memory/files*` 端点读写用户记忆文件，服务端负责路径安全校验、目录创建和索引更新。

---

## Requirements

### Requirement: 记忆文件列表 API
系统 SHALL 提供 `GET /api/memory/files` 端点，返回当前用户的记忆目录下所有 `.md` 文件列表。

#### Scenario: 列出所有记忆文件
- **WHEN** 已认证用户调用 `GET /api/memory/files`
- **THEN** 系统 SHALL 返回 JSON 数组，每个元素包含 `name`（文件名）和 `modifiedAt`（修改时间戳），仅包含 `.md` 后缀的文件

#### Scenario: 目录不存在时返回空列表
- **WHEN** 用户的记忆目录 `{MEMORY_FILES_DIR}/{user_id}/` 不存在
- **THEN** 系统 SHALL 返回空数组 `[]`，不报错

### Requirement: 记忆文件读取 API
系统 SHALL 提供 `GET /api/memory/files/{path}` 端点，返回指定记忆文件的内容。

#### Scenario: 读取已存在的文件
- **WHEN** 已认证用户调用 `GET /api/memory/files/MEMORY.md`
- **THEN** 系统 SHALL 返回 JSON 对象 `{"path": "MEMORY.md", "content": "...文件内容..."}`

#### Scenario: 文件不存在时返回 404
- **WHEN** 请求的文件路径不存在
- **THEN** 系统 SHALL 返回 HTTP 404 错误

#### Scenario: 路径遍历防护
- **WHEN** 请求路径包含 `..` 或非 `.md` 后缀
- **THEN** 系统 SHALL 返回 HTTP 400 错误，拒绝访问

### Requirement: 记忆文件写入 API
系统 SHALL 提供 `PUT /api/memory/files/{path}` 端点，写入指定记忆文件的内容。

#### Scenario: 写入文件内容
- **WHEN** 已认证用户调用 `PUT /api/memory/files/SOUL.md`，body 包含 `{"content": "新内容"}`
- **THEN** 系统 SHALL 将内容写入 `{MEMORY_FILES_DIR}/{user_id}/SOUL.md`，返回 `{"ok": true, "path": "SOUL.md"}`

#### Scenario: 写入 MEMORY.md 触发索引更新
- **WHEN** 写入的文件路径为 `MEMORY.md`
- **THEN** 系统 SHALL 在写入完成后异步调用 `rebuild_memory_index` 更新 RAG 索引

#### Scenario: 自动创建父目录
- **WHEN** 用户记忆目录尚不存在
- **THEN** 系统 SHALL 自动创建目录后写入文件

#### Scenario: 内容安全处理
- **WHEN** 写入内容包含 ASCII 控制字符
- **THEN** 系统 SHALL 去除 0x00-0x1F 范围的控制字符（保留 `\n` 和 `\t`）后写入
