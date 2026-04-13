## ADDED Requirements

### Requirement: 应用主窗口布局
系统 SHALL 提供暗色主题的桌面窗口，布局分为左侧边栏（导航）和右侧主区域（对话区）。

#### Scenario: 首次启动展示主界面
- **WHEN** 用户启动应用
- **THEN** 应用展示左侧导航栏和右侧主对话区，猫咪 IP 居中显示，状态栏显示「正在连接...」

#### Scenario: 侧边栏导航项
- **WHEN** 用户查看侧边栏
- **THEN** 侧边栏 SHALL 包含：新建任务、定时任务、技能库、个性化设置、能力控制入口

### Requirement: 猫咪 IP 动画状态机
系统 SHALL 展示一只猫咪 IP 形象，其动画状态随 AI 工作状态实时切换。

#### Scenario: 空闲状态
- **WHEN** 没有进行中的对话或工具执行
- **THEN** 猫咪播放 IDLE 动画（尾巴缓慢摆动）

#### Scenario: 思考状态
- **WHEN** 服务端发出 `llm_thinking` WebSocket 事件
- **THEN** 猫咪切换到 THINKING 动画（歪头、眼睛转圈）

#### Scenario: 工具执行状态
- **WHEN** 服务端发出 `tool_start` WebSocket 事件
- **THEN** 猫咪切换到 WORKING 动画（爪子敲击），持续至工具结束

#### Scenario: 任务成功
- **WHEN** 服务端发出 `tool_done` 或对话完成事件
- **THEN** 猫咪播放 SUCCESS 动画（跳起），播放完毕后自动回到 IDLE

#### Scenario: 任务失败
- **WHEN** 服务端发出 `tool_error` 事件
- **THEN** 猫咪播放 ERROR 动画（耳朵压下），播放完毕后回到 IDLE

### Requirement: 连接状态指示
系统 SHALL 在界面顶部实时展示与服务端的连接状态。

#### Scenario: 连接中
- **WHEN** 应用正在与服务端建立 WebSocket 连接
- **THEN** 顶部状态栏显示「正在连接...」和旋转动画

#### Scenario: 已连接
- **WHEN** WebSocket 连接建立成功
- **THEN** 状态栏显示绿色连接指示和当前会话名称

#### Scenario: 断开连接
- **WHEN** WebSocket 意外断开
- **THEN** 状态栏显示红色断开提示，应用自动每 5 秒重连一次

### Requirement: 工具调用可视化
系统 SHALL 在对话消息流中展示工具调用的执行过程，用户可展开或折叠详情。

#### Scenario: 工具调用卡片
- **WHEN** LLM 触发工具调用
- **THEN** 对话流中插入工具调用卡片，显示工具名称、参数摘要、执行状态

#### Scenario: 展开工具详情
- **WHEN** 用户点击工具调用卡片
- **THEN** 卡片展开，显示完整参数和执行输出（支持滚动）
