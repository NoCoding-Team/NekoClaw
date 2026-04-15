## ADDED Requirements

### Requirement: 记忆文件列表视图
MemoryPanel SHALL 显示 `{userData}/memory/` 下所有 Markdown 文件列表，`MEMORY.md` 固定置顶，每日笔记按日期倒序排列。

#### Scenario: 文件列表加载
- **WHEN** 用户打开 MemoryPanel 面板
- **THEN** 面板 SHALL 通过 `nekoBridge.memory.list()` 加载文件列表，显示文件名和最后修改时间

#### Scenario: MEMORY.md 置顶
- **WHEN** 文件列表加载完成
- **THEN** `MEMORY.md` SHALL 始终置于列表第一项，其余文件按修改时间倒序排列

#### Scenario: 空状态提示
- **WHEN** `{userData}/memory/` 目录为空或不存在
- **THEN** 面板 SHALL 显示引导提示"暂无记忆文件，与猫咪对话时会自动创建"

### Requirement: Markdown 内容查看
MemoryPanel SHALL 支持选中文件后以 Markdown 渲染格式查看文件内容。

#### Scenario: 查看文件内容
- **WHEN** 用户点击文件列表中的某个文件
- **THEN** 右侧区域 SHALL 以 Markdown 渲染格式显示文件完整内容

#### Scenario: 切换文件
- **WHEN** 用户点击列表中的其他文件
- **THEN** 右侧区域 SHALL 切换为新文件的渲染内容

### Requirement: Markdown 内联编辑
MemoryPanel SHALL 支持切换为编辑模式直接修改记忆文件。

#### Scenario: 进入编辑模式
- **WHEN** 用户在查看模式下点击"编辑"按钮
- **THEN** 右侧区域 SHALL 切换为纯文本编辑器，显示 Markdown 源文本

#### Scenario: 保存编辑
- **WHEN** 用户在编辑模式下点击"保存"按钮
- **THEN** 系统 SHALL 调用 `nekoBridge.memory.write(path, content)` 写入修改后的内容，并切回查看模式

#### Scenario: 放弃编辑
- **WHEN** 用户在编辑模式下点击"取消"按钮
- **THEN** 系统 SHALL 丢弃修改并恢复查看模式

### Requirement: 新建每日笔记
MemoryPanel SHALL 提供快捷按钮创建当天的每日笔记文件。

#### Scenario: 创建今日笔记
- **WHEN** 用户点击"新建今日笔记"按钮且 `memory/{today}.md` 不存在
- **THEN** 系统 SHALL 创建 `memory/{today}.md` 文件，内容为 `# {today}\n\n`，并自动打开编辑模式

#### Scenario: 今日笔记已存在
- **WHEN** 用户点击"新建今日笔记"按钮且 `memory/{today}.md` 已存在
- **THEN** 系统 SHALL 直接打开该文件进入查看模式

### Requirement: 手动云端同步
MemoryPanel SHALL 提供手动上传和拉取记忆文件到/从云端的操作按钮。

#### Scenario: 上传到云端
- **WHEN** 用户选择一个或多个文件后点击"上传到云端"
- **THEN** 系统 SHALL 将文件内容 POST 到后端 memory files API，成功后显示确认提示

#### Scenario: 从云端拉取
- **WHEN** 用户点击"从云端拉取"
- **THEN** 系统 SHALL 从后端 GET 云端记忆文件列表，用户选择后下载覆盖本地文件
