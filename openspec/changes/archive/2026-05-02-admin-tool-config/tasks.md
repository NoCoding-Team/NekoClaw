## 1. 数据模型与基础设施

- [x] 1.1 创建 `backend/app/models/tool_config.py`——ToolConfig ORM 模型（tool_name PK, enabled, credentials, updated_at）
- [x] 1.2 在 `backend/app/models/__init__.py` 中注册 ToolConfig，确保 alembic 可检测
- [x] 1.3 生成并执行数据库 migration（创建 tool_configs 表）

## 2. TOOL_DEFINITIONS 扩展

- [x] 2.1 在 `definitions.py` 每个工具定义中增加 `requires` 字段（credentials + services），无依赖的设为 None
- [x] 2.2 为 `web_search` 声明 `requires.credentials: [{key: "TAVILY_API_KEY", label: "Tavily API Key", hint: "..."}]`
- [x] 2.3 为 `python_repl` 声明 `requires.services: ["docker"]`
- [x] 2.4 为 `search_memory` 声明 `requires.services: ["milvus"]`（如适用）

## 3. 凭证读取与缓存

- [x] 3.1 新增 `backend/app/services/tools/tool_config_service.py`——提供 `get_tool_credential(tool_name, key)` 和 `get_globally_disabled_tools()` 函数
- [x] 3.2 实现进程内缓存（dict + 清除函数），Admin 修改时调用清除
- [x] 3.3 修改 `server_tools.py` 中 `execute_web_search()` 等函数，改用 `get_tool_credential()` 读取凭证（fallback 到 settings）

## 4. Admin API

- [x] 4.1 创建 `backend/app/schemas/tool_config.py`——请求/响应 schema（ToolConfigResponse, ToolConfigUpdate）
- [x] 4.2 在 `backend/app/api/admin.py` 中新增 `GET /admin/tools`——返回所有工具配置 + 状态
- [x] 4.3 新增 `PATCH /admin/tools/{name}`——更新 enabled / credentials（加密存储）
- [x] 4.4 新增 `GET /admin/tools/{name}/check`——运行时检测依赖状态（Docker ping 等）

## 5. 工具过滤逻辑修改

- [x] 5.1 修改 `backend/app/services/agent/tools.py` 的 `get_tools()`——在用户白名单过滤前先排除全局禁用的工具
- [x] 5.2 修改 `backend/app/services/agent/context.py` 的 `_build_tool_rules()`——排除全局禁用的工具组

## 6. 技能可用性联动

- [x] 6.1 修改技能加载逻辑——过滤掉 `requires_tools` 包含全局禁用工具的技能

## 7. 普通用户 API

- [x] 7.1 新增 `GET /tools/enabled` 端点——返回全局启用的工具名列表（无需 admin 权限）

## 8. Admin 前端

- [x] 8.1 新增 `admin/src/api/tools.ts`——封装 GET/PATCH/CHECK 工具管理 API
- [x] 8.2 新增 `admin/src/pages/ToolsPage.tsx`——工具管理页面（按 category 分组、开关、凭证表单、状态指示）
- [x] 8.3 新增 `admin/src/pages/ToolsPage.module.css`——页面样式
- [x] 8.4 在 Layout / 路由中注册 ToolsPage 导航入口

## 9. 桌面端适配

- [x] 9.1 桌面端新增 API 调用 `GET /tools/enabled`，获取全局启用工具列表
- [x] 9.2 修改爪力面板 AbilitiesPanel——只展示全局启用的工具
