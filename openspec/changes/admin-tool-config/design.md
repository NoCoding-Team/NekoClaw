## Context

NekoClaw 的工具系统已经过 `refactor-tool-definitions` 重构，每个工具有 `category` 分类。但工具的外部依赖配置（API Key 等）只能通过 `.env` 文件管理，需要重启服务才能生效。Admin 面板有 LLM 配置管理和技能管理，但缺少工具管理。

现有凭证管理参考：LLM API Key 已实现加密存储（`LLM_API_KEY_ENCRYPTION_KEY` + Fernet），可复用此模式。

工具权限有两层：admin 全局开关（天花板）→ 用户爪力面板（子集）→ 消息级 `allowed_tools`。

## Goals / Non-Goals

**Goals:**
- Admin 可在页面上按 category 分组查看所有工具及其依赖状态
- Admin 可全局启用/禁用工具，效果实时生效（无需重启）
- Admin 可在页面上配置工具所需的外部凭证（加密入库），替代手动编辑 `.env`
- Admin 禁用的工具对所有用户不可见，依赖该工具的技能自动不可用
- `.env` 中已有凭证作为 fallback，数据库配置优先
- `TOOL_DEFINITIONS` 中的 `requires` 字段可扩展，新增工具时声明依赖即可自动生成 admin 配置表单

**Non-Goals:**
- 不做用户级或角色级工具权限（仅全局级）
- 不做模型级工具限制
- 不做工具使用统计/审计
- 不迁移已有 `.env` 配置到数据库（手动按需迁移）

## Decisions

### 1. 数据模型：tool_configs 表

```python
class ToolConfig(Base):
    __tablename__ = "tool_configs"
    tool_name: str          # PK, 对应 TOOL_DEFINITIONS 中的 name
    enabled: bool           # 全局开关，默认 True
    credentials: str | None # 加密 JSON，如 {"TAVILY_API_KEY": "tvly-xxx"}
    updated_at: datetime
```

**替代方案**：分为 `tool_enabled` 和 `tool_credentials` 两张表 → 过度设计，一张表足够。

**凭证加密**：复用 `app/core/security.py` 中的 `encrypt_api_key` / `decrypt_api_key`（基于 Fernet），将整个 credentials JSON 作为字符串加密。

### 2. TOOL_DEFINITIONS 的 requires 字段

```python
{
    "name": "web_search",
    "requires": {
        "credentials": [
            {"key": "TAVILY_API_KEY", "label": "Tavily API Key", "hint": "从 app.tavily.com 获取"}
        ],
        "services": []
    },
},
{
    "name": "python_repl",
    "requires": {
        "credentials": [],
        "services": ["docker"]
    },
},
{
    "name": "http_request",
    # requires 为 None 或省略 → 无外部依赖
},
```

Admin 前端根据 `requires.credentials` 自动渲染凭证输入表单。`requires.services` 由后端运行时检测（如 Docker ping），不存库。

### 3. 凭证读取优先级

```
数据库 tool_configs.credentials → .env settings → 工具返回"未配置"错误
```

`server_tools.py` 中新增 `get_tool_credential(tool_name, key)` 辅助函数：
1. 查 DB `tool_configs` 表，解密 credentials JSON，取对应 key
2. 如果 DB 没有，fallback 到 `settings.TAVILY_API_KEY` 等 env var
3. 都没有返回 None

### 4. 全局开关如何影响工具过滤

```
agent/tools.py 的 get_tools():
  1. 从 DB 获取 globally_disabled_tools（enabled=False 的工具名集合）
  2. 从 allowed_tools 中去除 globally_disabled_tools
  3. 正常过滤流程

agent/context.py 的 _build_tool_rules():
  同理，排除全局禁用的工具组

桌面端：
  启动时或切换会话时从服务端获取 globally_enabled_tools 列表
  爪力面板只展示其中的工具
```

**缓存**：全局工具状态变化不频繁，可在后端做进程内缓存（dict + TTL），避免每次调 get_tools 都查 DB。Admin 修改时清缓存。

### 5. Admin API 设计

```
GET    /admin/tools              # 列出所有工具（含 category、requires、enabled 状态、依赖检测结果）
PATCH  /admin/tools/{name}       # 更新 enabled / credentials
GET    /admin/tools/{name}/check # 检测工具依赖状态（Docker ping、credential 是否有效等）
```

`GET /admin/tools` 返回格式：
```json
[
  {
    "name": "web_search",
    "category": "network",
    "description": "...",
    "enabled": true,
    "requires": { "credentials": [...], "services": [] },
    "status": {
      "credentials_configured": false,
      "services_available": true,
      "ready": false
    }
  }
]
```

### 6. Admin 前端页面

新增 `ToolsPage.tsx`，复用现有 admin 页面风格：
- 按 category 分组展示（网络工具、执行工具、文件工具…）
- 每个工具卡片显示：名称、描述、全局开关、依赖状态
- 点击展开显示凭证配置表单（根据 `requires.credentials` 动态渲染）
- 依赖状态指示：✅ 就绪 / ⚠️ 凭证未配 / ❌ 服务不可用

### 7. 桌面端获取全局工具列表

新增 API：`GET /tools/enabled`（无需 admin 权限，普通用户可调）返回当前全局启用的工具名列表。桌面端启动时请求一次，用于过滤爪力面板。

## Risks / Trade-offs

- **[DB 查询频率]** → get_tools() 每次 agent 调用都会触发。缓解：进程内缓存 + Admin 修改时清缓存（通过模块级 flag）。
- **[凭证迁移]** → 已有 `.env` 配置不自动迁移到 DB。缓解：fallback 机制确保旧配置继续生效；admin 可在 UI 中覆盖。
- **[加密密钥一致性]** → 工具凭证和 LLM Key 共用 `LLM_API_KEY_ENCRYPTION_KEY`。缓解：密钥名虽含"LLM"但实际是通用加密密钥，可考虑后续重命名但不在本次范围。
- **[桌面端缓存]** → 桌面端启动时获取一次全局列表，admin 修改后用户需刷新。缓解：可通过 WebSocket 推送工具状态变化，但不在本次范围。
