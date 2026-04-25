## MODIFIED Requirements

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
