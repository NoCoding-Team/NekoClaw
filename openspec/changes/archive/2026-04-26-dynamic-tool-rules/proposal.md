## Why

当用户在爪力面板中关闭某项工具（如网页搜索、浏览器自动化）后，系统提示词中的 `_TOOL_RULES`（Rule 3）仍然静态枚举所有工具的名称和执行环境描述，导致 LLM 始终认为自己拥有全部工具能力，在「你有哪些能力」等问答中会如实说出实际上已关闭的能力。

## What Changes

- 将 `_TOOL_RULES` 常量中的 Rule 3（工具执行环境）从静态硬编码字符串改为 `_build_tool_rules(allowed_tools)` 动态函数
- 按工具分组（本地文件、命令行、网络搜索、浏览器自动化、HTTP 请求、记忆工具），仅将 `allowed_tools` 中实际启用的工具组注入到 Rule 3
- `allowed_tools=None`（全量模式）保持现有行为，全部工具组均出现
- 记忆工具（`memory_read`、`memory_write`、`search_memory`）始终出现，不受 `allowed_tools` 控制
- `build_system_prompt()` 中的调用点由 `+ _TOOL_RULES` 改为 `+ _build_tool_rules(allowed_tools)`

## Capabilities

### New Capabilities

- 无新增能力

### Modified Capabilities

- `persona-files`：`build_system_prompt` 中工具规则部分由静态注入改为动态按 `allowed_tools` 过滤注入

## Impact

- **后端**：`backend/app/services/agent/context.py` — 删除 `_TOOL_RULES` 常量，新增 `_build_tool_rules(allowed_tools)` 函数，修改 `build_system_prompt()` 调用点
- **无 API 变更**：`build_system_prompt` 签名不变，`allowed_tools` 参数已存在
- **无前端变更**
- **无数据库变更**
