## ADDED Requirements

### Requirement: 文件操作工具
系统 SHALL 提供文件读取、写入、列目录、删除、移动/重命名等本地文件操作能力，通过 Electron 主进程 `fs/promises` 实现。

#### Scenario: 文件读取
- **WHEN** LLM 调用 `file_read` 工具并提供文件路径
- **THEN** 系统返回文件内容（文本文件）或 base64 编码（二进制文件），文件不存在时返回明确错误

#### Scenario: 文件写入
- **WHEN** LLM 调用 `file_write` 工具并提供路径和内容
- **THEN** 系统将内容写入指定文件，若目录不存在则自动创建

#### Scenario: 目录列表
- **WHEN** LLM 调用 `file_list` 工具并提供目录路径
- **THEN** 系统返回目录下的文件和子目录列表，包含名称、类型、大小、修改时间

#### Scenario: 文件删除沙盒拦截
- **WHEN** LLM 调用 `file_delete` 工具
- **THEN** 系统 SHALL 先经过沙盒评级，HIGH 级别需用户确认后才执行删除

### Requirement: 命令执行工具
系统 SHALL 提供本地 shell 命令执行能力，使用 `node-pty` 创建伪终端，支持流式输出。

#### Scenario: 命令执行流式输出
- **WHEN** LLM 调用 `shell_exec` 工具并提供命令字符串
- **THEN** 系统创建 pty 进程执行命令，输出实时通过 WebSocket 推送给服务端，最终汇总为工具结果

#### Scenario: 命令超时终止
- **WHEN** 命令执行超过 5 分钟（默认超时）
- **THEN** 系统 SHALL 强制终止进程，并返回超时错误和已收集的输出

#### Scenario: 命令执行日志
- **WHEN** 任意命令执行完毕
- **THEN** 系统 SHALL 将命令、执行时间、退出码、输出摘要记入本地操作日志

### Requirement: 浏览器自动化工具
系统 SHALL 提供基于 Playwright 的浏览器自动化能力，采用懒加载模式，首次调用时初始化，后续复用同一 BrowserContext。

#### Scenario: 懒加载初始化
- **WHEN** 首次调用 `browser_*` 系列工具
- **THEN** 系统 spawn Playwright Worker，初始化 Chromium BrowserContext，初始化完成后执行工具调用

#### Scenario: 页面导航
- **WHEN** LLM 调用 `browser_navigate` 工具并提供 URL
- **THEN** 系统打开或复用已有页面，导航到目标 URL，返回页面标题和最终 URL

#### Scenario: 页面截图
- **WHEN** LLM 调用 `browser_screenshot` 工具
- **THEN** 系统对当前页面截图，返回 base64 图片或保存到本地文件

#### Scenario: 元素交互
- **WHEN** LLM 调用 `browser_click` / `browser_type` 工具并提供选择器
- **THEN** 系统执行点击或输入操作，返回操作结果

#### Scenario: 浏览器自动关闭
- **WHEN** 浏览器工具连续 5 分钟未被调用
- **THEN** 系统 SHALL 自动 terminate Playwright Worker 以释放内存

### Requirement: 工具 IPC 安全边界
系统 SHALL 通过 Electron ipcMain/ipcRenderer 严格隔离渲染进程与本地工具，渲染进程不直接访问 Node.js API。

#### Scenario: 渲染进程调用本地工具
- **WHEN** 渲染进程需要触发本地工具
- **THEN** 渲染进程 MUST 通过 `ipcRenderer.invoke()` 发送请求，由主进程处理并返回结果

#### Scenario: 未授权直接访问拦截
- **WHEN** 渲染进程尝试直接访问 `fs`、`child_process` 等 Node.js 模块
- **THEN** Electron contextIsolation 设置 SHALL 阻止此类访问
