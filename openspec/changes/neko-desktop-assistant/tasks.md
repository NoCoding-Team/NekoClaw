## 1. 服务端基础骨架

- [x] 1.1 初始化 NekoClaw FastAPI 项目结构（main.py、config、core/security、core/exceptions）
- [x] 1.2 配置 SQLAlchemy async + PostgreSQL 连接，创建 BaseModel（软删除模式）
- [x] 1.3 实现用户注册/登录 API（`POST /api/auth/register`、`POST /api/auth/login`）
- [x] 1.4 实现 JWT access token + refresh token 生成与验证
- [x] 1.5 创建 FastAPI Depends() 认证依赖（`get_current_user`）
- [x] 1.6 实现 `POST /api/auth/refresh` token 刷新接口

## 2. 会话与 WebSocket

- [x] 2.1 创建 Session 数据模型（id、user_id、title、skill_id、created_at）
- [x] 2.2 创建 Message 数据模型（id、session_id、role、content、tool_calls、created_at）
- [x] 2.3 实现会话 CRUD API（`GET/POST /api/sessions`、`DELETE /api/sessions/{id}`）
- [x] 2.4 实现 WebSocket 端点 `/ws/{session_id}`，含 JWT 认证握手
- [x] 2.5 实现 WebSocket 事件总线（llm_thinking / llm_token / llm_done / tool_call / tool_error / tool_denied）
- [x] 2.6 实现心跳 ping/pong 保活机制（30s 间隔，90s 超时断开）
- [x] 2.7 实现短期记忆压缩逻辑（超过上下文 70% 时触发 LLM 摘要压缩）

## 3. LLM 调度模块

- [x] 3.1 创建 LLMConfig 数据模型（provider、model、api_key 加密存储、is_default）
- [x] 3.2 实现管理员 LLM 配置 CRUD API（`GET/POST/DELETE /api/admin/llm-configs`）
- [x] 3.3 实现 `GET /api/llm-configs` 获取可用模型列表（不返回 API Key）
- [x] 3.4 实现模式 A 托管调用：服务端 LLM 调用 + 流式 WebSocket 推送
- [ ] 3.5 实现模式 B 自定义 Key：服务端注入记忆/沙盒 Prompt 后返回增强 messages[]
- [x] 3.6 实现工具路由机制：根据工具定义的 `executor` 字段决定本地/服务端执行
- [x] 3.7 实现 PC 端工具执行超时处理（60s 无响应返回超时错误）
- [x] 3.8 集成网络搜索工具（Tavily API，`executor: "server"`）
- [x] 3.9 集成 HTTP 请求工具（httpx，`executor: "server"`）

## 4. 沙盒检测模块

- [x] 4.1 实现服务端语义危险分析器（正则 + 规则库检测危险命令模式）
- [x] 4.2 定义风险规则集（DENY 级别：rm -rf /、format、del /s /q C:\ 等；HIGH 级别：删除文件、写系统目录）
- [x] 4.3 实现风险等级标注（LOW / MEDIUM / HIGH / DENY）并附加到工具调用
- [x] 4.4 实现 DENY 级别直接拦截，向 LLM 注入拒绝原因，推送 tool_denied 事件

## 5. Skill 系统

- [x] 5.1 创建 Skill 数据模型（id、name、icon、system_prompt、allowed_tools、sandbox_level、is_builtin、owner_id）
- [x] 5.2 实现服务端启动时预置内置 Skill 种子数据（通用助手、代码助手、文件管家）
- [x] 5.3 实现 Skill CRUD API（`GET/POST/PUT/DELETE /api/skills`）
- [x] 5.4 实现内置 Skill 删除拦截（is_builtin=true 时拒绝删除）
- [x] 5.5 实现 Skill 工具白名单验证（LLM 调用不在 allowed_tools 中的工具时拒绝）

## 6. 记忆库模块

- [x] 6.1 创建 Memory 数据模型（id、user_id、category、content、storage_type、timestamp、source）
- [x] 6.2 实现记忆 CRUD API（`GET/POST/DELETE /api/memory`，支持按 category 过滤）
- [x] 6.3 实现记忆注入：会话开始时将相关记忆拼入系统提示
- [ ] 6.4 实现乐观锁防并发冲突（version 字段，写入时校验）
- [x] 6.5 实现记忆导出 API（`GET /api/memory/export`，返回 Markdown 文件）

## 7. PC 端 Electron 项目搭建

- [x] 7.1 初始化 Electron + React + TypeScript + Vite 项目结构
- [x] 7.2 配置 Electron contextIsolation + preload 脚本，建立安全的 IPC 桥接
- [x] 7.3 实现主窗口布局：暗色主题，左侧边栏 + 右侧主对话区
- [x] 7.4 实现侧边栏导航项（新建任务、定时任务、技能库、个性化设置、能力控制）
- [x] 7.5 集成 lottie-react，实现猫和 IP 动画状态机（IDLE/THINKING/WORKING/SUCCESS/ERROR）
- [x] 7.6 实现 WebSocket 客户端（连接管理、事件监听、断线指数退避重连）
- [x] 7.7 实现连接状态指示栏（顶部显示连接中/已连接/断开，正在连接旋转动画）

## 8. PC 端对话功能

- [x] 8.1 实现消息列表组件（用户气泡、AI 气泡、工具调用卡片）
- [x] 8.2 实现 LLM 流式 token 渲染（打字机效果，llm_token 事件追加）
- [x] 8.3 实现工具调用卡片（展示工具名、参数摘要、执行状态；可展开查看完整输出）
- [ ] 8.4 实现 Skill 选择器组件（下拉列表，显示 Skill 名称和图标）
- [ ] 8.5 实现 LLM 模式切换（模式 A/B 切换入口，模式 B 下自定义 API Key 输入）
- [ ] 8.6 实现 API Key 安全存储（Electron `safeStorage.encryptString()`）
- [x] 8.7 实现消息输入框（多行支持、发送快捷键 Ctrl+Enter）

## 9. PC 端本地工具层

- [x] 9.1 实现 FileToolHandler（file_read / file_write / file_list / file_delete，通过 ipcMain 注册）
- [x] 9.2 集成 node-pty，实现 TerminalHandler（shell_exec，伪终端流式输出，5 分钟超时）
- [x] 9.3 实现 BrowserHandler（Playwright Worker 懒加载，browser_navigate / browser_screenshot / browser_click / browser_type）
- [x] 9.4 实现浏览器 Worker 自动关闭（5 分钟无调用 terminate）
- [ ] 9.5 实现本地操作日志（命令执行记录写入本地文件）

## 10. PC 端沙盒确认 UI

- [x] 10.1 实现 HIGH 级别确认对话框（显示工具名、完整参数、风险原因，确认/拒绝按鈕）
- [x] 10.2 实现 MEDIUM 级别工具卡片黄色警告标记和一键确认
- [ ] 10.3 实现沙盒级别设置界面（阈值调整、关闭沙盒需二次确认）

## 11. PC 端记忆库界面

- [ ] 11.1 实现记忆库列表组件（按分类 tab 展示，显示内容摘要/时间/存储位置标签）
- [ ] 11.2 实现记忆条目删除（确认对话框）
- [ ] 11.3 实现本地记忆存储（本地文件读写，显示「仅本机」提示）
- [ ] 11.4 实现记忆导出（ZIP 打包下载）和导入（MD 文件解析，去重追加）

## 12. PC 端技能库界面

- [ ] 12.1 实现技能库列表页（内置 Skill + 用户自定义 Skill，卡片布局）
- [ ] 12.2 实现 Skill 创建/编辑表单（名称、图标、系统提示、工具选择、沙盒级别）
- [ ] 12.3 实现本地 Skill 存储（JSON 文件读写）

## 13. 定时任务

- [ ] 13.1 集成 `node-cron`，实现本地定时调度引擎
- [ ] 13.2 创建定时任务数据库模型（服务端），同步到 PC 端本地存储
- [ ] 13.3 实现定时任务创建 UI（一次性/周期性，时间选择器，任务描述）
- [ ] 13.4 实现任务触发逻辑：自动创建新会话并发送任务描述
- [ ] 13.5 实现错过任务检测（PC 启动时检查）和补执行提示通知
- [ ] 13.6 实现定时任务管理列表（暂停/删除/执行历史查看）

## 14. 集成测试与收尾

- [ ] 14.1 端到端测试：完整对话流程（发消息→LLM 推理→工具调用→结果返回）
- [ ] 14.2 端到端测试：沙盒拦截流程（危险命令→DENY→用户提示）
- [ ] 14.3 端到端测试：模式 B 自定义 Key 流程
- [ ] 14.4 端到端测试：记忆注入（跨会话记忆正确注入上下文）
- [ ] 14.5 配置 Electron 应用打包（Windows/macOS，包含 Playwright 依赖）
