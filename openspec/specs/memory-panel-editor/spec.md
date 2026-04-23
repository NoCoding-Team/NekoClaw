# memory-panel-editor

MemoryPanel 记忆文件浏览器与编辑器——替代原有 DB 记忆列表 UI，提供文件列表、Markdown 查看、内联编辑、每日笔记创建和云端同步功能。

---

## Overview

MemoryPanel 采用双栏布局：左栏为 `.md` 文件列表（`MEMORY.md` 置顶，其余按修改时间倒序），右栏为 Markdown 渲染查看 + 内联文本编辑。提供快捷创建当日笔记和手动云端同步按钮。

---

## Requirements

### 记忆文件列表视图

MemoryPanel SHALL 显示用户的所有 Markdown 记忆文件列表，SOUL.md / USER.md / AGENTS.md / MEMORY.md 固定置顶，其余按修改时间倒序排列。数据源 SHALL 通过服务端 REST API 获取，而非本地 IPC。

#### Scenario: 文件列表加载
- **WHEN** 用户打开 MemoryPanel 面板
- **THEN** 面板 SHALL 通过 `GET /api/memory/files` REST API 加载文件列表，显示文件名和最后修改时间

#### Scenario: 固定置顶排序
- **WHEN** 文件列表加载完成
- **THEN** 文件列表 SHALL 按以下顺序排列：SOUL.md（第 1）→ USER.md（第 2）→ AGENTS.md（第 3）→ MEMORY.md（第 4）→ 其余文件按修改时间倒序

#### Scenario: 空状态提示
- **WHEN** API 返回空数组
- **THEN** 面板 SHALL 显示引导提示"暂无记忆文件，与猫咪对话时会自动创建"

### Markdown 内容查看

MemoryPanel SHALL 通过服务端 REST API 读取文件内容并以 Markdown 渲染格式展示。

#### Scenario: 查看文件内容
- **WHEN** 用户点击文件列表中的某个文件
- **THEN** 面板 SHALL 通过 `GET /api/memory/files/{path}` 获取内容并以 Markdown 渲染格式显示

#### Scenario: 切换文件
- **WHEN** 用户点击列表中的其他文件
- **THEN** 右侧区域 SHALL 切换为新文件的渲染内容

### Markdown 内联编辑

MemoryPanel SHALL 通过服务端 REST API 保存编辑后的文件内容。

#### Scenario: 进入编辑模式
- **WHEN** 用户在查看模式下点击"编辑"按钮
- **THEN** 右侧区域 SHALL 切换为纯文本编辑器，显示 Markdown 源文本

#### Scenario: 保存编辑内容
- **WHEN** 用户在编辑模式修改内容后点击“保存”
- **THEN** 面板 SHALL 通过 `PUT /api/memory/files/{path}` 将内容写入服务端，并切回查看模式

#### Scenario: 放弃编辑
- **WHEN** 用户在编辑模式下点击"取消"按钮
- **THEN** 系统 SHALL 丢弃修改并恢复查看模式

### 新建每日笔记

MemoryPanel SHALL 提供快捷按钮创建当天的每日笔记文件。

#### Scenario: 创建今日笔记
- **WHEN** 用户点击"新建今日笔记"按钮且 `memory/{today}.md` 不存在
- **THEN** 系统 SHALL 创建 `memory/{today}.md` 文件，内容为 `# {today}\n\n`，并自动打开编辑模式

#### Scenario: 今日笔记已存在
- **WHEN** 用户点击"新建今日笔记"按钮且 `memory/{today}.md` 已存在
- **THEN** 系统 SHALL 直接打开该文件进入查看模式

### 手动云端同步

MemoryPanel SHALL 提供手动上传和拉取记忆文件到/从云端的操作按钮。

#### Scenario: 上传到云端
- **WHEN** 用户选择一个文件后点击"上传到云端"
- **THEN** 系统 SHALL 将文件内容 PUT 到后端 memory files API，成功后显示确认提示

#### Scenario: 从云端拉取
- **WHEN** 用户点击"从云端拉取"
- **THEN** 系统 SHALL 从后端 GET 云端记忆文件列表，将所有文件下载覆盖到本地并刷新文件列表
