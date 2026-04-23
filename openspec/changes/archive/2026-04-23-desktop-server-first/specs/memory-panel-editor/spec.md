## MODIFIED Requirements

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

### Markdown 内联编辑

MemoryPanel SHALL 通过服务端 REST API 保存编辑后的文件内容。

#### Scenario: 保存编辑内容
- **WHEN** 用户在编辑模式修改内容后点击"保存"
- **THEN** 面板 SHALL 通过 `PUT /api/memory/files/{path}` 将内容写入服务端

## REMOVED Requirements

### nekoBridge.memory IPC 数据源
**Reason**: MemoryPanel 数据源从本地 Electron IPC (`nekoBridge.memory.*`) 切换为服务端 REST API，不再需要 IPC 路径
**Migration**: 所有 `nekoBridge.memory.list/read/write` 调用替换为 `apiFetch` 调用对应的 `/api/memory/files*` 端点
