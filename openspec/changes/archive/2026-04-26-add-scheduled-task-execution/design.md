## Context

NekoClaw 已有定时任务基础：后端存在 `ScheduledTask` 模型和 `/api/scheduled-tasks` CRUD，桌面端 Electron main 进程已有 `node-cron`/`setTimeout` 调度雏形，React 侧已有“猫钟”面板。现状缺少完整执行闭环：触发后没有真正自动创建会话并发送 Agent 消息，也没有执行历史、错过任务记录、工具权限快照和稳定的状态更新。

该功能依赖桌面端在线执行，因为任务可能使用本地文件、Shell、浏览器自动化等 PC 侧工具。后端不应在没有 PC 客户端的情况下直接执行这类任务。

## Goals / Non-Goals

**Goals:**
- 让定时任务到点后自动创建新会话，并以任务描述作为用户消息执行 Agent。
- 创建/编辑任务时保存 `allowed_tools`，执行时使用任务保存的工具白名单。
- 新增执行历史，记录每次计划触发、开始、结束、状态、关联会话、错误和工具权限快照。
- 一次性任务错过后提示补跑或忽略；周期任务错过后只记录 missed，不自动补跑。
- 统一任务 ID 类型、状态字段和下次执行时间计算，支撑列表展示和调度同步。

**Non-Goals:**
- 不实现服务端无人值守执行定时任务。
- 不实现离线期间周期任务的批量补跑。
- 不引入新的分布式任务队列或后台 worker。
- 不改变现有 Agent/WebSocket 的核心对话协议，只补充任务触发所需的调用与回写。

## Decisions

### 后端作为配置与历史来源，桌面端作为调度与执行入口

后端保存 `scheduled_tasks` 和 `scheduled_task_runs`，负责校验、计算 `next_run_at`、提供列表/历史/状态回写 API。Electron main 进程继续负责本地 `node-cron` 和一次性 timer 注册，渲染进程负责把触发事件转换为“创建会话 + 发送消息”。

替代方案是由后端统一调度，但它无法可靠使用本机工具和用户本地权限，也无法保证用户的 PC 在线。因此本地调度更符合当前产品形态。

### 任务保存 `allowed_tools` 快照

任务创建/编辑时从当前爪力配置选择并保存 `allowed_tools`。触发时 WebSocket 消息携带该数组，Agent 使用这份权限，而不是读取实时全局配置。

这样可以避免用户后续调整全局工具配置后，旧任务的权限被意外扩大或缩小。执行历史还会保存 `allowed_tools_snapshot`，便于审计某次执行到底获得了哪些能力。

### 执行历史独立建表

新增 `scheduled_task_runs` 保存每次执行。任务表只保留聚合字段：`last_run_at`、`next_run_at`、`run_count`、`last_status`、`missed_count`。

这样任务列表可以快速展示状态，历史面板可以追溯每次执行详情，也避免把多次执行状态塞进单个任务记录。

### 错过策略保守处理

一次性任务如果 `run_at` 已过且没有成功执行，桌面端同步时创建/标记 missed，并提示用户“立即执行”或“忽略”。周期任务如果离线期间错过触发，只记录 missed，不自动补跑，下一次触发按新的 `next_run_at` 继续。

该策略避免应用启动时批量执行大量 Agent 任务，尤其是任务允许使用高风险本地工具时。

### 触发状态由 run 记录驱动

触发时先创建 `running` run 记录，再创建会话并发送消息。成功获得会话 ID 后回写 `session_id`；Agent 完成后标记 `success`，失败则标记 `failed` 并记录错误。手动立即执行和错过补跑复用同一套 run 记录，只是触发来源不同。

## Risks / Trade-offs

- [Risk] 渲染进程关闭或 WebSocket 未连接时，Electron 已触发任务但无法执行。→ 触发时创建 run 失败则不计为成功；前端恢复后重新同步并按 missed 策略处理。
- [Risk] 周期任务离线时间较长会丢失多次周期执行。→ 第一版明确只记录 missed，不补跑；后续可加“允许补跑最近一次”开关。
- [Risk] 高风险工具在无人值守任务中自动执行。→ 任务必须保存 `allowed_tools`，UI 在创建/编辑时展示将被授予的工具，并在执行历史保存快照。
- [Risk] cron 表达式与用户时区理解不一致。→ 任务保存 `timezone`，后端计算和展示 `next_run_at`，前端显示本地化时间。

## Migration Plan

1. 扩展 `scheduled_tasks` 字段并新增 `scheduled_task_runs` 表。
2. 迁移已有任务：补默认 `schedule_type`、`timezone`、`status`、`allowed_tools`、`last_status`，并按 `run_at`/`cron_expr` 计算 `next_run_at`。
3. 更新 API/schema 和前端类型，统一 ID 为字符串 UUID。
4. 接入桌面端调度同步和触发监听。
5. 如需回滚，可保留新增表不使用，前端退回只展示任务配置；旧任务表字段兼容保留。

## Open Questions

- 首版是否需要在创建任务 UI 中提供“选择工具权限”的细粒度面板，还是先默认保存当前全局爪力配置并展示只读快照？
- Agent 完成状态是否能从现有 WebSocket 事件可靠判断，还是需要后端提供更明确的 task run 完成回写入口？
