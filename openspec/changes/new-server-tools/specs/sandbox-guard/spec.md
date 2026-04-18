## MODIFIED Requirements

### Requirement: 服务端语义危险分析
系统 SHALL 在服务端对 `shell_exec`、`file_delete`、`file_write`、`python_repl` 等高风险工具调用进行静态语义分析，输出风险等级标签。

#### Scenario: 危险命令检测
- **WHEN** LLM 生成包含 `rm -rf /`、`format`、`del /f /s /q C:\` 等危险模式的 shell_exec 工具调用
- **THEN** 服务端 SHALL 将风险等级标记为 DENY，直接拒绝该工具调用，不下发给 PC 端

#### Scenario: 中等风险命令检测
- **WHEN** LLM 生成涉及删除文件或写入系统目录的工具调用
- **THEN** 服务端 SHALL 将风险等级标记为 HIGH，工具调用附带风险标签下发给 PC 端

#### Scenario: 低风险工具调用
- **WHEN** LLM 生成文件读取、目录列表等只读工具调用
- **THEN** 服务端标记风险等级为 LOW，工具调用正常下发

#### Scenario: DENY 级别拒绝响应
- **WHEN** 服务端判定工具调用为 DENY 级别
- **THEN** 服务端 SHALL 向 LLM 注入拒绝原因作为工具错误结果，并向 PC 端推送 `tool_denied` 事件

#### Scenario: python_repl 风险分析
- **WHEN** LLM 调用 `python_repl` 工具提交代码
- **THEN** 服务端 SHALL 对代码内容进行静态分析，包含 `os.system`、`subprocess`、`shutil.rmtree`、`open('/etc/'` 等危险模式时标记为 HIGH，代码整体默认标记为 MEDIUM

## ADDED Requirements

### Requirement: 服务端工具强制容器执行
所有 executor 为 server 的工具 SHALL 在 Docker 容器内执行，不受前端「执行环境」设置影响。

#### Scenario: 服务端工具容器执行
- **WHEN** tools_node 调度 executor 为 server 的工具
- **THEN** 系统 SHALL 在隔离容器中执行该工具，不论用户前端设置中的执行环境为透明模式还是容器模式

#### Scenario: 前端设置仅影响客户端工具
- **WHEN** 用户在前端设置中切换执行环境（透明/容器）
- **THEN** 该设置 SHALL 仅影响 executor 为 client 的工具（shell_exec、file_* 等），不影响服务端工具的执行方式
