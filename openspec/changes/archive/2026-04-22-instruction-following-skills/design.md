## Context

当前 NekoClaw 的 Skill 系统是 Function-Calling 范式：每个 Skill 是 DB 中的一行记录（system_prompt + allowed_tools + sandbox_level），用户手动选择后 prepare 节点加载对应配置。工具权限由三层控制：① Abilities 面板（toolWhitelist）② Settings 细粒度白名单 ③ Skill.allowed_tools。实际上 ①②  已经足够完成工具权限控制，③ 是冗余的。

Agent 的核心工具（fetch_url、shell_exec、python_repl 等）已通过 LangChain BaseTool + WebSocket Bridge 注册完毕。新增能力只能通过注册新 Tool 实现——这是唯一的扩展路径。

目标是引入 Instruction-Following 范式：Skill 变为 Markdown 教学文档，Agent 在运行时自动识别、阅读、按步骤组合核心工具完成任务。扩展能力只需写一个 SKILL.md 文件。

## Goals / Non-Goals

**Goals:**
- 用 SKILL.md 文件替换 DB Skill 模型，实现"写 Markdown 即新能力"
- Agent 自动从 System Prompt 的技能目录中匹配用户意图并调用对应文档
- 新增 `read_skill` 服务端工具，让 Agent 按需读取技能文档和附属资源
- 根据用户当前 allowed_tools 动态过滤可用技能列表（requires_tools ⊆ allowed_tools 才展示）
- 完全移除旧 Skill 系统（DB 模型、API、前端选择器）
- 交付 3-5 个示范性内置 SKILL.md

**Non-Goals:**
- 用户自定义 SKILL.md（UI 编辑器 / 本地目录扫描）—— 留给后续迭代
- Skill 市场 / 分享机制
- Persona 自定义（用户自定义 Agent 人设）—— 当前保持默认猫咪角色，后续独立迭代
- 技能的版本管理或热更新机制

## Decisions

### D1: SKILL.md 文件格式
**选择**：YAML Frontmatter + Markdown Body

```yaml
---
name: get-weather
description: 获取指定城市的实时天气信息
triggers:
  - 天气
  - weather
  - 气温
requires_tools:
  - fetch_url
author: system
version: "1.0"
---

# 获取天气信息

## 步骤
1. 使用 `fetch_url` 访问 ...
```

**理由**：Frontmatter 提供结构化元数据（用于快照生成和过滤），Markdown Body 是自然语言操作指南（直接给 LLM 阅读）。相比 JSON/TOML 配置文件，Markdown 对人类和 LLM 都最友好。

**替代方案**：
- 纯 JSON 配置：结构化好但不适合写操作步骤
- DB 记录 + 文本字段：回到了旧方案的路径

### D2: 技能加载策略 — 启动时扫描 + 内存缓存
**选择**：应用启动时扫描 `backend/skills/` 目录，解析所有 SKILL.md 的 Frontmatter，缓存在模块级变量中。

**理由**：内置技能数量有限（预计 < 50 个），全量加载无压力。避免了每次请求都扫描文件系统。

**替代方案**：
- 按需加载：每次请求才扫描，延迟高
- DB 索引：引入额外存储依赖，与"文件即能力"理念矛盾

### D3: 技能快照注入方式 — XML 字符串写入 System Prompt
**选择**：在 `build_system_prompt` 中注入 `<available_skills>` XML 块 + 技能系统使用规则。每次请求动态生成（根据用户 allowed_tools 过滤）。

```xml
<available_skills>
  <skill>
    <name>get-weather</name>
    <description>获取指定城市的实时天气信息</description>
    <triggers>天气, weather, 气温</triggers>
  </skill>
</available_skills>
```

**理由**：XML 标签在 System Prompt 中对 LLM 的结构化理解最强。动态过滤确保 Agent 不会看到用户禁用的工具所依赖的技能。

**替代方案**：
- 生成独立文件 SKILLS_SNAPSHOT.md 让 Agent 自行读取：多一次工具调用，增加延迟
- JSON 格式注入：LLM 对 XML 的结构化理解优于 JSON

### D4: read_skill 工具设计 — 带子文件路径的服务端工具
**选择**：新增 `read_skill` Server Tool，参数为 `skill`（必须）+ `file`（可选，默认 SKILL.md）。

```python
read_skill(skill="chart-analysis")                          # 读取 SKILL.md
read_skill(skill="chart-analysis", file="templates/bar.py") # 读取附属文件
```

安全约束：
- `skill` 参数只允许 `[a-z0-9_-]+` 正则
- `file` 路径规范化后禁止 `..` 遍历
- 解析后的绝对路径必须在 `skills/<name>/` 子目录下

**理由**：支持 SKILL.md 引用模板代码、示例数据等附属资源，使复杂技能可以携带辅助文件。

**替代方案**：
- 只支持读 SKILL.md：简单但限制了复杂技能的表达力
- 用通用 file_read（Client Tool）：路径在服务端，Client IPC 读不到

### D5: 可用技能动态过滤 — requires_tools ⊆ allowed_tools
**选择**：Snapshot 注入时检查每个 Skill 的 `requires_tools` 是否是用户当前 `allowed_tools` 的子集。不满足的 Skill 不出现在 `<available_skills>` 中。

**理由**：Agent 看不到无法使用的技能。避免 Agent 读了技能说明却发现工具被禁用的死循环。

**替代方案**：
- 全部展示并在运行时报错：体验差，浪费 token
- 忽略 requires_tools 检查：Agent 可能执行到一半失败

### D6: Persona 处理 — 保持默认，不绑定 Skill
**选择**：移除 Skill 后，Persona（角色人设）保持默认猫咪设定，硬编码在 `_DEFAULT_PERSONA` 常量中。不提供自定义入口。

**理由**：Persona 和 Skill（能力）是不同的关注点。当前 MVP 聚焦能力系统重构，Persona 自定义作为独立需求后续处理。

## Risks / Trade-offs

- **[LLM 不按规则使用技能]** Agent 可能忽略 available_skills 直接自由发挥，或读了 SKILL.md 但不遵循步骤 → **缓解**：System Prompt 中明确规则权重，通过 few-shot 示例强化行为；技能文档本身写得足够清晰
- **[System Prompt 膨胀]** 技能数量增多时 available_skills 块占用大量 token → **缓解**：只注入 name + description + triggers（不注入完整内容），控制在几百 token 内；未来可做语义匹配预筛选
- **[多一轮工具调用延迟]** 相比旧方案（直接绑定工具），新方案需要先 read_skill 再执行，多一轮 LLM loop → **缓解**：对大多数任务增加 1-2 秒延迟可接受；对不需要技能的简单对话无影响
- **[Breaking Change]** 移除 Skill API 和前端选择器影响现有用户 → **缓解**：当前处于早期阶段，用户量极少；数据库迁移需要处理 sessions.skill_id 列的移除
- **[附属资源安全]** read_skill 支持子文件路径可能被利用做路径遍历 → **缓解**：严格正则 + 路径规范化 + 绝对路径校验三重防护
