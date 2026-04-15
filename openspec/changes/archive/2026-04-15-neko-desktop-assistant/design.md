## Context

NekoClaw 是一个新建项目，后端骨架已存在（FastAPI + SQLAlchemy + PostgreSQL 架构，参照 NoDeskClaw 模式）。目前服务端无业务模块，PC 端尚未启动。

本设计覆盖整个系统的技术架构决策，跨越 PC 端（Electron 桌面客户端）与服务端（FastAPI 后端）两个子系统，以及两者之间的通信协议、工具执行模型、安全边界划分。

---

## Goals / Non-Goals

**Goals:**
- 确定 PC 端技术栈和猫咪 IP 动画方案
- 定义服务端 / PC 端职责边界（工具路由模型）
- 确定 LLM 双轨调用模式的实现方式
- 确定两层沙盒架构（服务端语义分析 + PC 端执行拦截）
- 确定记忆库的数据结构和存储策略
- 确定 Skill 体系的数据模型
- 确定 PC 端与服务端的通信协议

**Non-Goals:**
- Skill 市场 / 分享功能（后续迭代）
- 移动端 / Web 端客户端
- 离线本地小模型推理（后续迭代）
- 多租户 / 企业级权限体系
- 定时任务的复杂工作流编排

---

## Decisions

### D1：PC 端框架 — Electron + React

**选择**：Electron + React（TypeScript）+ Vite

**理由**：
- Electron 主进程可直接调用 Node.js API（fs、child_process、node-pty），无需额外桥接层
- React 生态成熟，Lottie-react（动画）、TailwindCSS（样式）直接可用
- Playwright 可在 Electron 主进程中作为 Worker 懒加载，不影响启动速度

**放弃 Tauri 的原因**：Tauri 的 Rust sidecar 对 Playwright 支持复杂，猫咪动画库（Lottie）在 WebView2 上有兼容隐患。

---

### D2：猫咪 IP 动画 — Lottie（首期）

**选择**：`lottie-react` 库 + After Effects 导出的 `.json` 动画文件

**状态机与动画绑定**：

```
CatState
  ├── IDLE        → lottie: cat-idle.json      (尾巴缓慢摆动，慵懒趴着)
  ├── THINKING    → lottie: cat-think.json     (歪头，眼睛转圈)
  ├── WORKING     → lottie: cat-work.json      (爪子敲键盘，专注)
  ├── SUCCESS     → lottie: cat-success.json   (跳起，✨ 特效，播完回 IDLE)
  ├── ERROR       → lottie: cat-error.json     (耳朵压下，沮丧，播完回 IDLE)
  └── WAITING     → lottie: cat-wait.json      (看着时钟，打哈欠)
```

状态由服务端 WebSocket 事件驱动：`llm_thinking` / `tool_start` / `tool_done` / `tool_error`。

**未来升级路径**：IP 设计成熟后可迁移到 Spine 骨骼动画，接口保持不变（只换 JSON 资产）。

---

### D3：本地工具执行层架构

**选择**：Electron 主进程直接运行工具，Playwright 懒加载为独立 Worker

```
渲染进程 (React UI)
    │ ipcRenderer.invoke()
    ▼
主进程 (Node.js)
    ├── FileToolHandler    → fs/promises (直接)
    ├── TerminalHandler    → node-pty (伪终端, 流式输出)
    └── BrowserHandler     → Playwright Worker (首次调用时 spawn)
                               复用同一个 BrowserContext
```

工具调用统一走 **ipcMain**，渲染进程不直接接触本地 API（安全隔离）。

**放弃"sidecar 独立进程"的原因**：现阶段复杂度不必要，主进程崩溃时 Electron 本身会重启；Playwright Worker 通过 AbortController 可独立终止。

---

### D4：工具路由模型

服务端 LLM 生成工具调用后，需判断在哪里执行：

```
┌──────────────────────────────────────────────────────┐
│  服务端执行（直接）                                    │
│  - web_search     →  Tavily / SearXNG API            │
│  - http_request   →  httpx（服务端发出）              │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  PC 端执行（转发）                                    │
│  - file_*         →  本地文件系统                    │
│  - shell_exec     →  node-pty                        │
│  - browser_*      →  Playwright                      │
└──────────────────────────────────────────────────────┘
```

**路由机制**：每个工具定义中标注 `executor: "server" | "client"`。服务端 LLM 生成工具调用后，若 `executor == "client"`，将 tool_call 通过 WebSocket 推送给 PC 端，PC 端执行后将结果回传，服务端继续 LLM 推理。

---

### D5：LLM 双轨模式

```
模式 A（托管，默认）：
  PC端 → WebSocket → 服务端 → LLM Provider（服务端 API Key）
  → 流式响应 → WebSocket → PC端

模式 B（自定义，隐私优先）：
  PC端 → WebSocket → 服务端（注入记忆 + 沙盒 Prompt）
  服务端返回增强后的 messages[] 给 PC 端
  PC端 → 直接调用 LLM Provider（用户自己的 API Key）
  → 流式响应 → PC端
  PC端 → WebSocket → 服务端（同步结果到记忆库）
```

**关键**：模式 B 中，LLM 的对话内容不经过服务端，保护用户隐私；但服务端仍负责记忆注入和沙盒验证。

用户可在 PC 端设置中切换模式，自定义 API Key 加密存储于 PC 端本地（Electron `safeStorage`）。

---

### D6：沙盒两层架构

**服务端（语义层）**：
- 对 shell_exec / file_delete / file_write 类工具调用进行静态分析
- 检测危险模式：`rm -rf /`、`format`、`del /f /s /q C:\`、`chmod 777 /etc`、写系统目录等
- 输出风险等级标签：`LOW | MEDIUM | HIGH | DENY`
- `DENY` 在服务端直接拦截，不下发给 PC 端

**PC 端（执行层）**：
- `HIGH` → 弹出确认对话框，展示具体命令/路径，用户手动确认
- `MEDIUM` → 工具调用卡片上显示警告，可一键确认
- `LOW` → 静默执行，记入本地操作日志
- 用户可在设置中调整阈值（如所有命令执行都要求确认）

---

### D7：记忆库数据模型

**结构化 MD 文档**，存于服务端数据库（`text` 字段），同时支持导出为本地文件：

```
memory/
  user.md       ← 用户偏好、习惯、个人信息片段
  projects.md   ← 当前/历史项目上下文
  facts.md      ← 用户主动告知的事实
  skills.md     ← 用户擅长的技能、常用工具
```

每条记忆为一个**原子条目**（Markdown 列表项），带时间戳和来源标注。用户可在 PC 端记忆库界面逐条查看/删除，并标记「存云端」或「仅本地」。

---

### D8：Skill 数据模型

```json
{
  "id": "uuid",
  "name": "代码助手",
  "icon": "🔧",
  "system_prompt": "你是一只精通编程的猫咪助手...",
  "allowed_tools": ["file_read", "file_write", "shell_exec"],
  "sandbox_level": "MEDIUM",
  "is_builtin": true,
  "owner_id": null,
  "created_at": "..."
}
```

内置 Skill 由服务端预置，`is_builtin=true`，用户不可删除但可覆盖。用户自定义 Skill 可选择存云端（`owner_id` 关联用户）或本地（PC 端 JSON 文件）。

---

### D9：通信协议设计

**WebSocket** (`/ws/{session_id}`)：实时双向通道
- 上行：用户消息、工具执行结果（PC 端→服务端）
- 下行：LLM 流式 token、工具调用指令、猫咪状态事件、沙盒确认请求

**REST API**：非实时操作
- `GET/PUT /api/memory` — 记忆库读写
- `GET/POST/DELETE /api/skills` — Skill 管理
- `GET/POST /api/sessions` — 会话列表
- `GET /api/llm-configs` — 可用 LLM 配置列表

---

## Risks / Trade-offs

| 风险 | 说明 | 缓解措施 |
|------|------|---------|
| 命令执行安全 | node-pty 可执行任意系统命令，危险性极高 | 两层沙盒 + 默认启用 HIGH 确认；明确文档说明风险 |
| Playwright 内存占用 | 启动后常驻内存约 150-300MB | 懒加载 + 超时自动关闭（5分钟无使用则 terminate） |
| 模式 B 的 Prompt 注入 | 服务端返回 messages 给 PC 端，若被篡改可能注入恶意指令 | HTTPS + WebSocket WSS 传输加密；服务端签名 messages |
| 多 PC 并发记忆冲突 | 两台 PC 同时写同一用户记忆库 | 服务端记忆写入加乐观锁（version 字段），冲突时保留最新 |
| 本地记忆同步 | 用户选择「仅本地」的记忆无法跨设备同步 | 在 UI 上明确提示；提供手动导出/导入功能 |
| Lottie 动画资产缺失 | 首期无专业设计师，动画文件可能粗糙 | 使用开源猫咪 Lottie 资产占位，后期替换；接口不变 |

---

## Open Questions

1. **网络搜索工具选型**：Tavily（付费，质量好）vs SearXNG（自部署，免费）？建议先集成 Tavily，后续支持可配置后端。
2. **定时任务触发机制**：PC 端使用 `node-cron` 本地调度，还是服务端推送唤醒？PC 端离线时如何处理？
3. **猫咪 Lottie 资产从哪来**：首期用开源资产，还是等设计师出图？不影响架构，但影响上线时的视觉质量。
