## MODIFIED Requirements

### Requirement: 服务端语义危险分析
系统 SHALL 在 LangChain `BaseTool._arun()` 方法内部对工具调用进行静态语义分析，输出风险等级标签。沙箱分析逻辑（`analyze_risk()` 函数）保持不变，调用入口从 `services/llm.py` 的 Agent 循环移到每个 BaseTool 子类的 `_arun()` 方法开头。

#### Scenario: 危险命令检测
- **WHEN** LLM 生成包含 `rm -rf /`、`format`、`del /f /s /q C:\` 等危险模式的 shell_exec 工具调用
- **THEN** BaseTool._arun() SHALL 调用 `analyze_risk()` 判定为 DENY，返回错误消息，通过 WebSocket 推送 `tool_denied` 事件，不执行工具

#### Scenario: 中等风险命令检测
- **WHEN** LLM 生成涉及删除文件或写入系统目录的工具调用
- **THEN** BaseTool._arun() SHALL 调用 `analyze_risk()` 标记为 HIGH，工具调用附带风险标签通过 WebSocket 下发给 PC 端

#### Scenario: 低风险工具调用
- **WHEN** LLM 生成文件读取、目录列表等只读工具调用
- **THEN** BaseTool._arun() SHALL 调用 `analyze_risk()` 标记为 LOW，正常执行

#### Scenario: DENY 级别拒绝响应
- **WHEN** `analyze_risk()` 判定为 DENY
- **THEN** BaseTool._arun() SHALL 返回 JSON 错误字符串 `{"error": "Tool call blocked by sandbox: <reason>"}`，并通过 WebSocket 推送 `tool_denied` 事件
