## Why

当前 Agent 的能力局限于文件操作、Shell 执行和网页搜索。缺少三项关键能力：代码执行（数据处理/计算）、网页内容获取（搜索后的深度阅读）、知识库检索（基于用户文档的 RAG）。这三项是 Agent 从"对话助手"升级为"真正能干事的助手"的核心拼图。

## What Changes

- 新增 `python_repl` 服务端工具：在 Docker 容器中执行 Python 代码，赋予 Agent 逻辑计算和数据处理能力
- 新增 `fetch_url` 服务端工具：获取 URL 内容并清洗为 Markdown，作为 Agent 深度阅读网页的核心手段；description 引导 LLM 优先使用此工具而非 `http_request`
- 新增 `search_knowledge_base` 动态路由工具：支持本地优先 + 云端 fallback 的混合检索（BM25 + Vector Hybrid Search）
- 服务端工具统一在容器内执行，不受前端"执行环境"设置影响
- Embedding 模型走服务端默认配置，用户可在客户端覆盖
- 本地知识库索引：首次全量构建 + chokidar watch 增量更新

## Capabilities

### New Capabilities
- `python-repl`: Python 代码解释器，服务端容器隔离执行，支持科学计算库
- `fetch-url`: URL 内容获取与 HTML→Markdown 清洗，复用 SSRF 防护
- `knowledge-retrieval`: 混合检索知识库（BM25 + Vector），本地优先 + 云端 fallback，支持 PDF/MD/TXT

### Modified Capabilities
- `sandbox-guard`: 新增 python_repl 的风险分析规则；服务端工具强制容器执行策略
- `local-tools`: 客户端新增 search_knowledge_base 本地执行路径（SQLite + FTS5 + sqlite-vec）

## Impact

- **后端依赖**: 新增 `beautifulsoup4`、`html2text`、`docker` SDK；知识库云端模式需 `llama-index` 相关包
- **前端依赖**: 客户端本地检索需 `better-sqlite3`、`sqlite-vec`；文件监控需 `chokidar`；文档解析需 `pdf-parse`
- **Docker**: python_repl 需要预构建 Python 沙盒镜像（含 numpy/pandas/matplotlib）
- **API**: `tools_node` 需支持动态 executor 路由（search_knowledge_base 根据本地索引状态选择 client/server）
- **配置**: 服务端需新增默认 embedding 模型配置项；前端设置面板新增知识库目录配置
- **存储**: 本地索引文件（SQLite）；服务端 `storage/` 目录持久化云端索引
