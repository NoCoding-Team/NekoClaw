## Context

NekoClaw 当前记忆架构：
- **System Prompt 构建** (`context.py:build_system_prompt`): 硬编码 `_DEFAULT_PERSONA` + `_TOOL_RULES` + Skills XML + `_load_memory()` 注入 MEMORY.md + 今天/昨天日报
- **记忆存储**: `{MEMORY_FILES_DIR}/{user_id}/` 下的 `.md` 文件（MEMORY.md + YYYY-MM-DD.md），DB `memories` 表作为 legacy fallback
- **记忆刷新** (`memory_refresh`): 每 15 轮用户消息触发 sub-LLM 调用，只做追加写入
- **超限处理**: MEMORY.md > 4000 字符时暴力截断
- **前端 MemoryPanel**: 双栏布局，文件列表 + 内容查看/编辑，MEMORY.md 置顶

本设计在现有框架上增量改造，不改变整体 WebSocket Agent 架构和 LangGraph 拓扑。

## Goals / Non-Goals

**Goals:**
- 人设可自定义：用户通过 MemoryPanel 编辑 SOUL.md / USER.md / AGENTS.md 即可改变 Agent 人格和行为规则
- 记忆质量提升：MEMORY.md 不再无限膨胀，refresh 时做整合去重
- 大记忆可用：MEMORY.md 超限后通过 RAG 精准检索，不丢信息
- 自动提炼：每日笔记中有价值的信息自动沉淀到长期记忆
- 隐私优先：记忆默认本地，云端同步完全手动

**Non-Goals:**
- 不做向量数据库部署（复用 SQLite FTS5 + embedding blob）
- 不做实时记忆冲突检测（仅在 refresh 时整合）
- 不做多设备自动同步（保持手动上传/拉取）
- 不做 MEMORY.md 版本回滚（用户明确不需要备份机制）
- 不改动消息存储机制（DB messages 表不变）

## Decisions

### D1: 人设文件存储位置与加载顺序

**决策**: SOUL.md / USER.md / AGENTS.md 存放于 `{MEMORY_FILES_DIR}/{user_id}/`，与 MEMORY.md 同目录。

**理由**: 复用已有的 `memory_write/read` 工具和 MemoryPanel UI，无需新建存储路径或 API。Agent 通过 `memory_write("USER.md", ...)` 就能自主维护用户画像。

**替代方案**: 单独建 `persona/` 子目录 → 增加路径复杂度，需要改 MemoryPanel 支持子目录浏览，收益不大。

**加载优先级**: `build_system_prompt` 拼接顺序：
1. SOUL.md（人格/语气/边界）→ 替代 `_DEFAULT_PERSONA`
2. USER.md（用户画像）
3. AGENTS.md（操作指令/优先级）→ 替代 `_TOOL_RULES` 中的非工具声明部分
4. `_TOOL_RULES`（工具声明部分保留硬编码，因为它跟 tool definitions 强耦合）
5. Skills XML + `_SKILL_SYSTEM_RULES`
6. 记忆注入（MEMORY.md + 日报）

### D2: 默认模板自动创建

**决策**: 在 `_load_persona_file(user_id, filename)` 中，若文件不存在则写入默认模板并返回。

**SOUL.md 默认模板**: 基于当前 `_DEFAULT_PERSONA` 扩展：
```markdown
# 人格
- 你是一只聪明可爱的猫咪助手，叫做 NekoClaw
- 友好、专业、严谨，适应性强

# 语气
- 友好而专业，避免过于复杂的术语
- 正向鼓励，提供建设性反馈
- 请用中文回复用户

# 边界
- 保护用户隐私，不主动收集敏感信息
- 超出能力范围时诚实告知
- 遵循道德规范和法律规定
```

**USER.md 默认模板**:
```markdown
# 用户画像
<!-- 以下内容由 NekoClaw 在对话中自动学习填充，你也可以手动编辑 -->

## 基本信息
- 称呼：（待学习）

## 偏好
- （待学习）

## 常用技术栈
- （待学习）
```

**AGENTS.md 默认模板**:
```markdown
# 操作指令

## 优先级
- 安全 > 效率 > 体验

## 记忆策略
- 重要决策、用户偏好、关键事实写入 MEMORY.md
- 当日对话要点写入 YYYY-MM-DD.md
- 发现用户信息时更新 USER.md

## 行为规则
- 优先使用内置工具完成任务
- 高风险操作前需要用户确认
- 不确定时主动询问而非猜测
```

### D3: 整合式 Memory Refresh

**决策**: `memory_refresh()` 的 sub-LLM prompt 从"追加"改为"整合"——要求 LLM 读取已有 MEMORY.md，与新信息对比后输出完整的整合结果。

**新 refresh prompt 核心指令**:
```
分析以下对话，与已有记忆对比后执行整合：
- 新发现的信息 → 追加到对应分区
- 已有但发生变化的信息 → 就地更新（如"住在北京"→"搬到杭州"）
- 重复信息 → 合并为一条
- 被明确否定/过时的信息 → 删除
- 保持 MEMORY.md 的 ## 分区结构
```

**不做备份**: 用户明确表示信任 LLM 整合能力，不增加 `.bak` 机制。

**风险**: LLM 可能误删有效信息 → 缓解：daily notes 本身保留不删，用户可从历史笔记中找回。

### D4: MEMORY.md 超限 RAG 检索

**决策**: `_load_memory()` 增加 RAG 分支——MEMORY.md ≤ 4000 字符全文注入，> 4000 字符时走 RAG 混合检索。

**RAG 索引**: 为记忆文件建立独立的 SQLite DB（`{STORAGE_ROOT}/{user_id}/memory_index.db`），复用 `knowledge.py` 的 FTS5 + embedding 框架但物理隔离。

**索引更新时机**: `execute_memory_write()` 成功后异步触发增量重建对应文件的索引。

**RAG query 构造**: `query = session_title + " " + last_user_message`。session_title 从 `prepare` 节点的 Session ORM 获取，last_user_message 从 messages 列表取最后一条 HumanMessage。

**`_load_memory` 签名变化**:
```python
async def _load_memory(user_id: str, query_hint: str = "") -> str:
```
`build_system_prompt` 需要传入 query_hint，`prepare` 节点在调用 `build_system_prompt` 前构造 hint。

### D5: Daily Digest 定时任务

**决策**: 作为后端定时任务运行，每天固定时间（凌晨 2:00 UTC+8）扫描所有用户的前一天日报。

**实现方式**: 复用 `scheduled_tasks` 框架的 cron 表达式触发。但 Digest 不是用户创建的任务，而是系统内置任务。在 `startup.py` 中注册一个内部 cron job。

**Digest Agent 流程**:
1. 读取 `{yesterday}.md`，若不存在或内容为空则跳过
2. 读取 `MEMORY.md` 已有内容
3. Sub-LLM 调用：评估日报营养价值，有价值则整合到 MEMORY.md
4. LLM 判断无价值时不调用任何写入工具，直接返回

**LLM 配置**: 使用用户的默认 LLM 配置（从 DB 读取）。若用户无配置则跳过该用户。

**错误处理**: best-effort，单用户失败不影响其他用户，异常写日志不抛出。

### D6: MemoryPanel 排序规则

**决策**: 文件列表固定排序——SOUL.md → USER.md → AGENTS.md → MEMORY.md → 其余按修改时间倒序。

**实现**: 前端排序函数加权重映射：
```typescript
const PIN_ORDER: Record<string, number> = {
  'SOUL.md': 0, 'USER.md': 1, 'AGENTS.md': 2, 'MEMORY.md': 3
}
```

## Risks / Trade-offs

- **[整合式 refresh 误删信息]** → 缓解：daily notes 原文保留；用户可通过 MemoryPanel 手动修正 MEMORY.md
- **[RAG 索引占用磁盘]** → 影响极小：记忆文件总量一般 <1MB，索引 <5MB
- **[Daily Digest LLM 成本]** → 缓解：仅对前一天有内容的日报触发，无内容跳过；单次调用 max 3 轮工具
- **[首次加载延迟（创建默认模板）]** → 影响极小：仅首次触发，写 3 个小文件 <10ms
- **[AGENTS.md 与 _TOOL_RULES 职责边界]** → 工具声明（工具名、执行环境描述）保留硬编码因为与代码强耦合；行为规则（优先级、记忆策略）移入 AGENTS.md 可由用户编辑
