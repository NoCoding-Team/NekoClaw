## 1. 后端：重构工具规则为动态函数

- [x] 1.1 在 `backend/app/services/agent/context.py` 中定义工具分组常量：5 个工具组（本地文件、命令行、网络搜索、浏览器、HTTP），每组包含对应工具名列表和执行环境描述文本
- [x] 1.2 新增 `_build_tool_rules(allowed_tools: list[str] | None) -> str` 函数：`allowed_tools=None` 时返回与原 `_TOOL_RULES` 等价的完整字符串；否则按分组过滤，仅注入 `allowed_tools` 中有工具的组；记忆工具组始终注入
- [x] 1.3 删除模块级 `_TOOL_RULES` 常量
- [x] 1.4 在 `build_system_prompt()` 中将 `+ "\n\n" + _TOOL_RULES` 替换为 `+ "\n\n" + _build_tool_rules(allowed_tools)`

## 2. 验证

- [ ] 2.1 手动验证：`allowed_tools=None` 时生成的工具规则与原内容等价（全量工具组出现）
- [ ] 2.2 手动验证：`allowed_tools=["file_read"]` 时只有本地文件组和记忆组出现，其他组不出现
- [ ] 2.3 手动验证：`allowed_tools=[]` 时只有记忆工具组出现
- [ ] 2.4 在应用中关闭「网页搜索」能力后，问「你有哪些能力」，确认 LLM 不再提及网络搜索
- [x] 2.5 运行后端类型检查，确认无新增 lint 或类型错误
