## 1. 清理 Legacy 工具

- [x] 1.1 从 `TOOL_DEFINITIONS` 中删除 `save_memory` 和 `update_memory` 定义
- [x] 1.2 从 `server_tools.py` 中删除 `execute_save_memory`、`execute_update_memory` 函数及 dispatcher 分支
- [x] 1.3 从 `server_tools.py` 中删除仅被 legacy 函数使用的辅助代码（`_CTRL_CHARS`、`_sanitize` 等，如果 memory_write 不再使用的话）

## 2. 合并 fetch_url 进 http_request

- [x] 2.1 从 `TOOL_DEFINITIONS` 中删除 `fetch_url` 定义
- [x] 2.2 修改 `http_request` 定义：executor 改为 `server`，method 改为可选（默认 GET），新增 `parse_html` 布尔参数（默认 false），更新 description
- [x] 2.3 在 `server_tools.py` 中实现合并后的 `execute_http_request`：当 `parse_html=true` 时执行 HTML→Markdown 清洗（复用原 `execute_fetch_url` 逻辑）
- [x] 2.4 从 `server_tools.py` 中删除 `execute_fetch_url` 函数
- [x] 2.5 更新 `execute_server_tool` dispatcher：移除 `fetch_url` 分支，确认 `http_request` 走 server 分支

## 3. 添加 category 字段

- [x] 3.1 为 `TOOL_DEFINITIONS` 中所有工具添加 `category` 字段，按设计文档分配

## 4. System prompt 分组展示

- [x] 4.1 修改 `context.py` 中工具描述生成逻辑，按 category 分组输出，每组带中文标题
- [x] 4.2 确保 `internal` 分类（read_skill）不出现在分组展示中

## 5. 桌面端清理

- [x] 5.1 从桌面端 Electron 移除 `http_request` 的 client tool handler（该工具已改为 server 执行）

## 6. 技能文件更新

- [x] 6.1 更新 `backend/skills/get-weather/SKILL.md`：将 `fetch_url` 引用改为 `http_request` + `parse_html=true`
- [x] 6.2 更新 `backend/skills/summarize-webpage/SKILL.md`：将 `fetch_url` 引用改为 `http_request` + `parse_html=true`

## 7. 验证

- [x] 7.1 确认 `TOOL_DEFINITIONS` 剩余 15 个工具，每个都有 category
- [x] 7.2 确认 `TOOL_MAP` 中不含 `fetch_url`、`save_memory`、`update_memory`
- [x] 7.3 确认 `agent/tools.py` 中无 `fetch_url` 特殊处理残留
