## Context

NekoClaw 当前有 14 个工具（5 server + 9 client），通过 `definitions.py` 注册、`nodes.py` 的 `tools_node` 分发。服务端工具直接调用 Python 函数，客户端工具通过 WebSocket bridge 转发到 Electron。本次新增 3 个工具：`python_repl`、`fetch_url`、`search_knowledge_base`。

后端部署在 Docker 中（docker-compose.yml），已有容器隔离 UI 设计但尚未实现实际的容器化执行。服务端工具安全性由 `sandbox.py` 的 `analyze_risk` 负责。

## Goals / Non-Goals

**Goals:**
- 新增 `python_repl` 工具，在独立 Docker 容器中执行用户代码，与后端进程完全隔离
- 新增 `fetch_url` 工具，获取网页内容并清洗为 Markdown，复用现有 SSRF 防护
- 新增 `search_knowledge_base` 工具，本地有索引走客户端，本地无结果再走云端
- 所有服务端工具统一在容器内执行（不受前端「执行环境」设置影响）
- Embedding 模型：服务端配置默认值，用户可在客户端覆盖

**Non-Goals:**
- 不做 Jupyter Notebook 式的持久会话 REPL（每次调用独立执行）
- 不做知识库的多租户共享（每个用户独立索引）
- 不做 embedding 模型的本地推理（首版只走 API）
- 不改造前端「执行环境」设置的含义（仍只管客户端工具）

## Decisions

### D1: python_repl 容器隔离策略

**选择**: 通过 Docker SDK (`docker-py`) 启动临时容器执行代码，执行完销毁。

**替代方案**:
- `PythonREPLTool` 直接 exec()：快但危险，Agent 代码在后端进程内执行
- RestrictedPython：安全但限制太多，无法使用 numpy/pandas
- subprocess + seccomp：Linux-only，跨平台差

**设计**:
```
用户代码 → 写入临时文件 → docker run --rm --network=none
         → 预构建镜像（含 numpy/pandas/matplotlib）
         → 超时 30s → 收集 stdout/stderr → 返回结果
```

关键限制：`--network=none`（禁止访问网络）、`--memory=256m`、`--cpus=0.5`、`--read-only`（只读文件系统，`/tmp` 除外）。

### D2: fetch_url 与 http_request 的边界

**选择**: 两个独立工具，通过 description 引导 LLM 选择。

- `fetch_url`: "获取网页内容，返回清洗后的 Markdown 文本。获取任何 URL 内容时优先使用此工具。"
- `http_request`: 现有 description 收窄为 "仅在需要自定义请求方法/Header/Body 或调用 REST API 时使用。"

**实现**: `httpx.AsyncClient` GET → BeautifulSoup 解析 → `html2text` 转 Markdown → 截断至 4000 字符。复用 `server_tools.py` 已有的私网 IP 检查。

### D3: search_knowledge_base 动态路由

**选择**: 注册为 server 工具，`tools_node` 中根据用户本地索引状态动态路由。

**路由逻辑**:
```
tools_node 收到 search_knowledge_base 调用
  │
  ├─ 向客户端发 "check_local_index" 事件
  │  客户端回复 has_index: true/false
  │
  ├─ has_index == true
  │   → 转为 client tool 模式：发 tool_call 事件，等客户端返回检索结果
  │   → 客户端返回空结果？→ fallback 到云端
  │
  └─ has_index == false
      → 服务端容器内执行检索
      → 无云端索引？→ 返回 "未配置知识库"
```

客户端无需知道自己是「fallback」角色，接口一致：都是收到 `tool_call`，返回 `tool_result`。

### D4: 本地知识库技术栈

**选择**: `better-sqlite3` + `sqlite-vec`（向量）+ `FTS5`（BM25），一个 SQLite 文件承载全部。

**替代方案**:
- LlamaIndex（Python-only，客户端用不了）
- Vectra + MiniSearch（两套独立存储，同步复杂）
- ChromaDB（重依赖，Electron 集成困难）

**索引构建**: Electron 主进程中：
1. 启动时扫描 `knowledge/` 目录，对比文件 mtime 做增量索引
2. `chokidar.watch()` 监控文件变化，增量更新
3. 文件解析：`pdf-parse`（PDF）、原生 `fs`（MD/TXT）
4. 分块：按段落 + 固定 token 窗口（512 tokens，128 overlap）

### D5: Embedding 模型配置

**选择**: 服务端维护默认 embedding 配置，客户端可覆盖。

```
get_embedding(text) 解析顺序:
  1. 用户客户端自定义 embedding 配置 → 使用
  2. 服务端默认 embedding 配置 → 使用
  3. 都没配 → 报错 "未配置 embedding 模型"
```

首版只支持 API 调用（OpenAI `text-embedding-3-small` 等），不做本地推理。

### D6: 云端知识库存储

**选择**: 服务端 `storage/{user_id}/knowledge/` 目录 + SQLite 索引文件。

用户通过 UI 上传文件 → 后端存储 → 自动构建索引。索引构建在容器内完成。

## Risks / Trade-offs

- **[Docker 依赖]** python_repl 要求宿主机有 Docker → 无 Docker 环境下该工具不可用。缓解：启动时检测 Docker 可用性，不可用时在 tool definition 中标记 disabled。
- **[冷启动延迟]** 首次 docker run 拉取镜像可能很慢 → 缓解：启动时预拉取镜像；或首次调用时提示用户等待。
- **[Embedding 成本]** 大量文档索引时 embedding API 调用量大 → 缓解：分批处理 + 增量索引（只处理变更文件）。
- **[SQLite 并发]** Electron 主进程 + chokidar 回调可能并发写 SQLite → 缓解：`better-sqlite3` 是同步的，天然串行化；或用 WAL 模式。
- **[动态路由复杂度]** search_knowledge_base 的 "本地优先 + 云端 fallback" 增加了 tools_node 的分支逻辑 → 缓解：路由逻辑封装为独立函数，不污染主流程。

## Open Questions

- Python 沙盒预构建镜像的具体包列表？是否需要用户自定义安装额外包？
- 云端知识库的文件上传 API 设计（REST？分片上传？大小限制？）
- 知识库检索结果的 top-K 数量和 score 阈值如何确定？
