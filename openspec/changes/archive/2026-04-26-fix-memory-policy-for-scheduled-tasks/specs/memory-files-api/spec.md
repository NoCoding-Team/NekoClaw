## ADDED Requirements

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
