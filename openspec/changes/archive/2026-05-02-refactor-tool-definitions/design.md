## Context

NekoClaw 的工具体系由 `backend/app/services/tools/definitions.py` 中的 `TOOL_DEFINITIONS` 列表驱动，通过 `executor` 字段区分 server/client 执行。当前 18 个工具平铺定义，无分类元数据；system prompt 中工具描述也是平铺注入。随着工具增长，LLM 选择工具的准确率下降，且存在语义重叠（fetch_url vs http_request）和历史遗留（save_memory / update_memory）。

## Goals / Non-Goals

**Goals:**
- 精简工具数量：18 → 15（删 3 个）
- 为每个工具引入 `category` 分类字段
- 合并 `fetch_url` 功能进 `http_request`，统一网络请求入口
- System prompt 按 category 分组展示工具，提升 LLM 工具选择准确率
- 清理所有关联的执行代码、客户端 handler、技能文件引用

**Non-Goals:**
- 不改变工具的合并粒度（不把多个工具合成一个带 action 参数的工具）
- 不改变 skill 系统的设计（skill 仍为操作手册，tool 仍为原子能力）
- 不改变 LangGraph agent 的编排逻辑
- 不做工具权限体系重构

## Decisions

### 1. `http_request` 合并策略

**决定**: 在 `http_request` 上新增 `parse_html` 布尔参数（默认 `false`），当为 `true` 时执行原 `fetch_url` 的 HTML→Markdown 清洗逻辑。

**替代方案**:
- `mode` 枚举参数（`raw` / `webpage`）→ 枚举语义不如布尔直观，LLM 更容易用错
- 保留 `fetch_url` 只做重命名 → 未能解决两个工具语义重叠的根本问题

**理由**: 布尔参数最简单，`false` = 原始 HTTP，`true` = 网页阅读模式。LLM 不需要理解枚举值的含义。

### 2. `http_request` executor 改为 server

**决定**: `http_request` 从 `client` 改为 `server` 执行。

**理由**:
- SSRF 防护集中在 server 端，统一管控更安全
- HTML 清洗所需的 BeautifulSoup + html2text 已在 server 端部署
- 避免桌面端重复实现安全检查和清洗逻辑

**代价**: 无法通过 `http_request` 访问用户本机局域网服务（会被 SSRF 防护拦截）。这是有意的安全取舍。

### 3. category 字段设计

**决定**: 在 `TOOL_DEFINITIONS` 每个条目中添加 `category` 字符串字段，值为以下枚举之一：

| category | 工具 |
|----------|------|
| `internal` | `read_skill` |
| `memory` | `search_memory`, `memory_read`, `memory_write` |
| `file` | `file_read`, `file_write`, `file_list`, `file_delete` |
| `execution` | `python_repl`, `shell_exec` |
| `network` | `web_search`, `http_request` |
| `browser` | `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_type` |

`category` 不影响运行时路由，仅用于 system prompt 分组展示和 admin 面板展示。

### 4. system prompt 分组格式

**决定**: 在 `context.py` 的工具描述注入部分，按 category 分组，每组带中文标题：

```
## 记忆工具
- search_memory: 搜索用户的长期记忆...
- memory_read: 读取指定记忆文件...
- memory_write: 写入记忆文件...

## 文件工具
- file_read: ...
...
```

`internal` 分类（`read_skill`）不在分组中展示，保持现有的特殊注入方式。

### 5. Legacy 工具直接删除

**决定**: `save_memory` 和 `update_memory` 从 `TOOL_DEFINITIONS` 和 `server_tools.py` 中完全移除，不做 deprecated 过渡。

**理由**: 这两个工具已被 `memory_write` 完全替代，在当前版本中不应再被调用。如果有旧 session 引用了这些工具名，dispatcher 会返回 `Unknown server tool` 错误，不会导致系统崩溃。

## Risks / Trade-offs

- **[BREAKING: http_request 执行器变更]** → 桌面端已有的 http_request handler 需要移除。如果有用户依赖 client 端执行 http_request 访问本地服务，合并后将无法使用。缓解：这是有意的安全决策，且当前没有已知的此类使用场景。
- **[BREAKING: fetch_url 删除]** → 技能文件（get-weather、summarize-webpage）中的 `requires_tools: [fetch_url]` 需要更新为 `http_request`。缓解：一并在此变更中更新。
- **[数据库残留]** → 已有模型配置中的 `allowed_tools` 可能包含 `fetch_url`。缓解：工具过滤逻辑应忽略不存在的工具名，不会报错；后续可通过数据迁移清理。
- **[LLM 行为变化]** → 合并后 LLM 需要学会在想读网页时加 `parse_html=true`。缓解：工具描述中明确说明此参数的用途。
