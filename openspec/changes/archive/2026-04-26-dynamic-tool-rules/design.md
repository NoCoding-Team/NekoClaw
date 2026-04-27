## Context

当前 `build_system_prompt()` 在构建系统提示时，工具规则部分（`_TOOL_RULES`）是一个静态常量字符串，其中 Rule 3 枚举了所有工具的名称和执行环境：

```
shell_exec、file_read/write/list/delete、browser_*、web_search、http_request → 本机/服务端执行
```

这段描述与 `allowed_tools` 无关，无论用户在爪力面板关闭了哪些工具，LLM 始终能从 system prompt 中看到所有工具的描述，导致问答时给出不准确的能力说明。

相比之下，技能系统（`build_available_skills_prompt`）已经正确按 `allowed_tools` 动态过滤，工具规则这部分尚未跟进。

## Goals / Non-Goals

**Goals:**
- `build_system_prompt` 中注入的工具执行环境描述（Rule 3）与实际 `allowed_tools` 保持一致
- `allowed_tools=None`（全量模式）行为与现在完全相同
- 记忆工具始终出现，不受 `allowed_tools` 控制
- 改动范围极小，仅修改 `context.py` 一个文件

**Non-Goals:**
- 不修改爪力面板 UI 或前端逻辑
- 不修改 `allowed_tools` 的传递链路
- 不引入新的配置项或数据库字段

## Decisions

### 决策 1：函数替换常量

将 `_TOOL_RULES` 从模块级常量改为 `_build_tool_rules(allowed_tools: list[str] | None) -> str` 函数。

**理由**：常量无法接受参数；函数方式最小侵入，不改变调用结构。

**替代方案**：在 `build_system_prompt` 里 patch 字符串 → 脆弱，依赖固定文本格式，不可取。

### 决策 2：工具按"能力组"分组注入

Rule 3 按以下分组构建，每组作为一个独立条目：

| 组 | 工具名 | 执行环境 |
|---|---|---|
| 本地文件 | `file_read`/`file_write`/`file_list`/`file_delete` | 本机 IPC |
| 命令行执行 | `shell_exec` | 本机 IPC |
| 网络搜索 | `web_search` | 服务端 |
| 浏览器自动化 | `browser_navigate`/`browser_screenshot`/`browser_click`/`browser_type` | 本机 IPC |
| HTTP 请求 | `http_request` | 服务端 |
| 记忆工具（常驻）| `memory_write`/`memory_read`/`search_memory` | 服务端，始终注入 |

**理由**：与爪力面板的分组逻辑保持一致，用户关闭「网页搜索」→ `web_search` 从 allowed_tools 移除 → Rule 3 中「网络搜索」条目消失，LLM 不再知道自己有该能力。

### 决策 3：检测策略——组内任一工具存在即注入整组

每组使用 `any(t in allowed_tools for t in <组内工具列表>)` 判断。

**理由**：浏览器工具拆成4个，用户不会单独开关单个浏览器操作；组级别与面板开关粒度一致。

## Risks / Trade-offs

- **极低风险**：`allowed_tools=None` 路径行为完全不变，存量代码无影响
- **测试覆盖**：Rule 3 目前无单元测试，需补充几个参数化用例
- **SOUL.md 用户自定义描述**：用户可能在 SOUL.md 里手写「我拥有网络搜索能力」，关掉工具后 system prompt 仍然包含该描述 → 这是用户自主行为，不在本次修复范围内，后续可引导用户更新 SOUL.md
