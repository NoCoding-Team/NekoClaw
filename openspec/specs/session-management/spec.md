## ADDED Requirements

### Requirement: 会话创建与管理
系统 SHALL 支持多会话管理，用户可创建、切换、删除会话，每个会话拥有独立的对话历史和激活 Skill。

#### Scenario: 创建新会话
- **WHEN** 用户点击「新建任务」按钮
- **THEN** 系统创建新会话，分配唯一 session_id，建立 WebSocket 连接，对话区清空

#### Scenario: 切换会话
- **WHEN** 用户在侧边栏点击历史会话
- **THEN** 系统加载该会话的历史消息并显示，重新建立对应的 WebSocket 连接

#### Scenario: 删除会话
- **WHEN** 用户删除某个会话
- **THEN** 系统删除对应的会话记录和消息历史，关闭关联的 WebSocket 连接

### Requirement: WebSocket 实时通信
系统 SHALL 通过 WebSocket 实现 PC 端与服务端的实时双向通信，支持流式 LLM 输出和工具执行事件推送。

#### Scenario: WebSocket 连接建立
- **WHEN** PC 端创建或恢复会话
- **THEN** 系统建立到 `/ws/{session_id}` 的 WebSocket 连接，携带 JWT 认证 token

#### Scenario: 心跳保活
- **WHEN** WebSocket 连接建立后
- **THEN** 客户端 SHALL 每 30 秒发送 ping，服务端回复 pong；超过 90 秒无响应则断开并重连

#### Scenario: 断线重连
- **WHEN** WebSocket 意外断开
- **THEN** PC 端 SHALL 以指数退避策略自动重连（最大间隔 30 秒，最大重试次数不限）

### Requirement: 短期记忆压缩
系统 SHALL 在对话消息超过上下文长度限制时，自动将早期消息压缩为摘要注入系统提示。

#### Scenario: 触发压缩
- **WHEN** 当前会话 token 数量超过配置阈值（默认模型上下文的 70%）
- **THEN** 服务端 SHALL 调用 LLM 将最早的 N 条消息压缩为摘要，替换原始消息

#### Scenario: 压缩对用户透明
- **WHEN** 发生消息压缩
- **THEN** PC 端 SHALL 在早期消息区域显示「[已压缩为摘要]」标记，用户可点击查看摘要内容

### Requirement: 用户认证
系统 SHALL 要求用户登录后才能使用服务，支持用户名密码注册/登录，JWT Token 用于 API 和 WebSocket 认证。

#### Scenario: 用户登录
- **WHEN** 用户输入用户名和密码登录
- **THEN** 服务端验证凭据，返回 JWT access token 和 refresh token，PC 端安全存储

#### Scenario: Token 刷新
- **WHEN** access token 过期
- **THEN** PC 端 SHALL 使用 refresh token 自动获取新 access token，无需用户重新登录

#### Scenario: 未认证请求拦截
- **WHEN** PC 端 WebSocket 连接未携带有效 JWT
- **THEN** 服务端 SHALL 拒绝连接并返回 401 状态码
