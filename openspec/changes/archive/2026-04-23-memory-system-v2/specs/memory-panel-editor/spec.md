## MODIFIED Requirements

### 记忆文件列表视图

MemoryPanel SHALL 显示 `{userData}/memory/` 下所有 Markdown 文件列表，SOUL.md / USER.md / AGENTS.md / MEMORY.md 固定置顶，其余按修改时间倒序排列。

#### Scenario: 文件列表加载
- **WHEN** 用户打开 MemoryPanel 面板
- **THEN** 面板 SHALL 通过 `nekoBridge.memory.list()` 加载文件列表，显示文件名和最后修改时间

#### Scenario: 固定置顶排序
- **WHEN** 文件列表加载完成
- **THEN** 文件列表 SHALL 按以下顺序排列：SOUL.md（第 1）→ USER.md（第 2）→ AGENTS.md（第 3）→ MEMORY.md（第 4）→ 其余文件按修改时间倒序

#### Scenario: 空状态提示
- **WHEN** `{userData}/memory/` 目录为空或不存在
- **THEN** 面板 SHALL 显示引导提示"暂无记忆文件，与猫咪对话时会自动创建"
