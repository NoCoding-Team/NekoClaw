## ADDED Requirements

### Requirement: 服务端语义危险分析
系统 SHALL 在服务端对 `shell_exec`、`file_delete`、`file_write` 等高风险工具调用进行静态语义分析，输出风险等级标签。

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

### Requirement: PC 端执行层确认拦截
系统 SHALL 在 PC 端根据服务端返回的风险等级决定是否需要用户确认。

#### Scenario: HIGH 级别必须确认
- **WHEN** PC 端收到风险等级为 HIGH 的工具调用
- **THEN** 系统 SHALL 弹出确认对话框，显示工具名称、完整参数、风险原因，用户点击「确认执行」后才执行

#### Scenario: MEDIUM 级别卡片警告
- **WHEN** PC 端收到风险等级为 MEDIUM 的工具调用
- **THEN** 工具调用卡片显示黄色警告标记，用户可一键确认或拒绝

#### Scenario: LOW 级别静默执行
- **WHEN** PC 端收到风险等级为 LOW 的工具调用
- **THEN** 工具调用无需用户确认，直接执行，执行结果记入本地操作日志

#### Scenario: 用户拒绝执行
- **WHEN** 用户在确认对话框中点击「拒绝」
- **THEN** PC 端向服务端返回用户拒绝的 tool_result，服务端将拒绝信息注入 LLM 上下文

### Requirement: 沙盒级别用户配置
系统 SHALL 允许用户在 PC 端设置中自定义确认触发阈值。

#### Scenario: 提高确认阈值
- **WHEN** 用户将设置调整为「所有工具执行都需要确认」
- **THEN** 即使 LOW 级别的工具调用也会弹出确认对话框

#### Scenario: 关闭沙盒（高级用户）
- **WHEN** 用户明确关闭沙盒功能
- **THEN** 系统 SHALL 显示安全风险警告并要求二次确认，确认后所有工具调用跳过 PC 端确认（服务端 DENY 仍然有效）
