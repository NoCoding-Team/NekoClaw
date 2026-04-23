## Why

NekoClaw 的记忆系统已有 MEMORY.md + 每日笔记 + memory_write/read/search 工具的基础框架，但与 OpenClaw 级别的工业级记忆系统相比，存在几个关键缺陷：人设硬编码在 Python 代码中无法自定义、MEMORY.md 只增不减导致记忆膨胀且暴力截断丢失信息、缺少每日笔记到长期记忆的智能提炼机制、操作规则无法被用户编辑。本次变更将记忆系统从"能用"升级到"好用"，引入文件化人设、整合式记忆刷新、RAG 超限检索和智能日报消化。

## What Changes

- 新增 SOUL.md、USER.md、AGENTS.md 人设/配置文件，system prompt 从文件加载而非硬编码
- MemoryPanel 文件列表排序调整：SOUL.md → USER.md → AGENTS.md → MEMORY.md 置顶
- Memory Refresh 从"只追加"升级为"整合/去重/冲突消解"模式
- MEMORY.md 超 4000 字符时切换为 RAG 混合检索注入，query 结合会话标题 + 用户最后一条消息
- 新增 Daily Digest 后台定时任务：每天自动分析前一天笔记，有营养的内容提取到 MEMORY.md
- 记忆文件默认本地存储，云端同步保持手动操作，文件列表增加同步状态标签

## Capabilities

### New Capabilities
- `persona-files`: SOUL.md / USER.md / AGENTS.md 文件化人设系统——自动创建默认模板、加载到 system prompt、Agent 可自主维护 USER.md
- `memory-consolidation`: Memory Refresh 整合模式——LLM 在 refresh 时对 MEMORY.md 执行去重、冲突消解、过时删除，而非仅追加
- `memory-rag-injection`: MEMORY.md 超限时 RAG 检索注入——复用 knowledge.py 的 SQLite FTS5 + embedding 框架为记忆建立独立索引
- `daily-digest`: Daily Digest 定时任务——后台 Agent 评估前一天笔记的信息价值，有营养的提取到 MEMORY.md

### Modified Capabilities
- `active-memory`: system prompt 构建逻辑变更——`build_system_prompt` 需加载 SOUL.md / USER.md / AGENTS.md，`_load_memory` 增加 RAG 分支
- `memory-panel-editor`: MemoryPanel 排序规则变更——SOUL.md / USER.md / AGENTS.md 固定置顶
- `memory-refresh-triggers`: refresh prompt 从追加模式改为整合模式

## Impact

- **后端 context.py**: `build_system_prompt()` 重构，`_load_memory()` 增加 RAG 分支，`memory_refresh()` prompt 重写
- **后端 server_tools.py**: 首次访问时自动创建 SOUL.md / USER.md / AGENTS.md 默认模板
- **后端新增**: memory RAG 索引模块（独立 SQLite DB）、daily-digest 定时任务
- **前端 MemoryPanel.tsx**: 文件排序逻辑调整，固定置顶三个人设文件
- **依赖**: 无新外部依赖，复用已有 knowledge.py 的 FTS5 + embedding 框架
