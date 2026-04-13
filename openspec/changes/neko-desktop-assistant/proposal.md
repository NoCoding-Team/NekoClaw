## Why

NekoClaw 是一个面向桌面用户的 AI 助手产品，需要一套完整的 PC 端 + 服务端协同架构。用户希望通过一只活泼的猫咪 IP 形象，以对话方式驱动真实的本地工具能力（命令执行、文件操作、浏览器自动化等），同时由服务端统一管理 LLM 调度、记忆库、沙盒检测与 Skill 体系，支持多用户、多 PC 同时在线。

## What Changes

- **新建 PC 桌面客户端**（Electron + React）：暗色 UI，猫咪 Lottie 动画 IP，侧边栏 + 主对话区布局
- **新建本地工具执行层**：文件操作（fs）、命令执行（node-pty）、浏览器自动化（Playwright 懒加载）
- **新建服务端 LLM 调度模块**：支持多模型配置（OpenAI/Claude/Gemini 等），双轨模式（服务端托管 / 用户自定义 API Key）
- **新建 Skill 体系**：每个 Skill 包含系统提示 + 工具白名单 + 沙盒级别，支持内置/用户自定义
- **新建记忆库管理**：结构化 MD 文档存储（user/projects/facts/skills），支持云端或本地存储选择
- **新建沙盒与确认机制**：服务端做语义危险分析（LOW/MEDIUM/HIGH/DENY），PC 端做执行层拦截
- **新建 WebSocket 实时通信**：流式 LLM 输出 + 工具执行进度推送
- **新建任务调度**：定时任务支持（PC 端本地触发）

## Capabilities

### New Capabilities

- `pc-client-shell`: PC 端 Electron 应用框架，UI 布局，猫咪 IP 动画状态机，主/侧边栏
- `local-tools`: 本地工具执行层——文件操作、命令执行（node-pty）、浏览器自动化（Playwright）
- `llm-dispatch`: 服务端 LLM 调度，多模型配置，双轨模式（托管 Key / 用户自带 Key）
- `skill-system`: Skill 定义、管理、执行——系统提示 + 工具集合 + 沙盒级别
- `memory-system`: 结构化记忆库——MD 文档分类存储，云端/本地可选，跨会话注入上下文
- `sandbox-guard`: 两层沙盒——服务端语义危险分析 + PC 端执行确认拦截
- `session-management`: 会话管理，WebSocket 流式通信，短期/长期记忆压缩
- `scheduled-tasks`: 定时任务创建与本地触发

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **PC 端**：全新 Electron 应用，依赖 node-pty、Playwright、Lottie-react；需处理本地文件系统权限、IPC 通信
- **服务端**：NekoClaw FastAPI 后端扩展，增加 LLM 调度、记忆库、Skill 管理、沙盒检测等模块
- **通信协议**：WebSocket（流式对话/工具进度）+ REST API（记忆读写/Skill 管理/用户配置）
- **存储**：服务端 PostgreSQL（会话、记忆、Skill、用户配置）+ 可选本地文件（隐私记忆）
- **安全边界**：命令执行工具存在本地系统安全风险，需沙盒机制严格把控
