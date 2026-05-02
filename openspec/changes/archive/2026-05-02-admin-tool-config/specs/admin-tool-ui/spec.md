## ADDED Requirements

### Requirement: 工具管理页面入口
Admin 面板 SHALL 在侧边栏导航中新增「工具管理」入口，路由为 `/tools`。

#### Scenario: 导航到工具管理
- **WHEN** Admin 点击侧边栏「工具管理」
- **THEN** 系统 SHALL 渲染 ToolsPage，展示所有工具按 category 分组的列表

### Requirement: 按 category 分组展示
工具管理页面 SHALL 按 category 分组展示工具卡片，每组有中文分类标题。

#### Scenario: 分组渲染
- **WHEN** 工具列表加载完成
- **THEN** 页面 SHALL 按 category 分组，每组标题为中文分类名（如「网络工具」「执行工具」「文件工具」），组内显示该分类的所有工具卡片

### Requirement: 工具卡片信息展示
每个工具卡片 SHALL 展示名称、描述、全局开关、依赖状态指示。

#### Scenario: 卡片内容
- **WHEN** 渲染工具卡片
- **THEN** 卡片 SHALL 显示：工具名称、工具描述、全局启用/禁用 Switch、依赖状态图标（✅ 就绪 / ⚠️ 凭证未配 / ❌ 服务不可用）

#### Scenario: 无外部依赖的工具
- **WHEN** 工具无 `requires` 或 requires 为空
- **THEN** 卡片 SHALL 只显示名称、描述和全局开关，不显示依赖状态

### Requirement: 全局开关操作
Admin SHALL 可通过工具卡片上的 Switch 切换工具的全局启用/禁用状态。

#### Scenario: 禁用工具
- **WHEN** Admin 关闭工具卡片的 Switch
- **THEN** 前端 SHALL 调用 `PATCH /admin/tools/{name}` 设置 `enabled=false`，更新 UI 状态

#### Scenario: 启用工具
- **WHEN** Admin 打开工具卡片的 Switch
- **THEN** 前端 SHALL 调用 `PATCH /admin/tools/{name}` 设置 `enabled=true`，更新 UI 状态

### Requirement: 凭证配置表单
工具卡片展开后 SHALL 根据 `requires.credentials` 动态渲染凭证输入表单。

#### Scenario: 展开凭证配置
- **WHEN** Admin 点击工具卡片的展开按钮，且该工具有 `requires.credentials`
- **THEN** 页面 SHALL 为每个 credential 渲染一个输入框，显示 `label` 作为标签、`hint` 作为占位提示

#### Scenario: 保存凭证
- **WHEN** Admin 填写凭证并点击保存
- **THEN** 前端 SHALL 调用 `PATCH /admin/tools/{name}` 携带 `credentials` 对象，保存成功后刷新依赖状态

#### Scenario: 凭证已配置时显示遮盖
- **WHEN** 工具已有凭证（从 API 返回 `credentials_configured=true`）
- **THEN** 输入框 SHALL 显示占位符（如 `••••••••`），不回显真实值

### Requirement: 依赖状态刷新
Admin SHALL 可手动刷新单个工具的依赖检测状态。

#### Scenario: 刷新依赖状态
- **WHEN** Admin 点击工具卡片的刷新按钮
- **THEN** 前端 SHALL 调用 `GET /admin/tools/{name}/check`，更新该工具的 status 展示
