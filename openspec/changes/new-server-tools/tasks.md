## 1. fetch_url 工具（服务端）

- [x] 1.1 后端 requirements.txt 新增 `beautifulsoup4`、`html2text` 依赖
- [x] 1.2 在 `definitions.py` 注册 `fetch_url` 工具定义（executor: server），同时收窄 `http_request` description
- [x] 1.3 在 `server_tools.py` 实现 `execute_fetch_url`：httpx GET → SSRF 检查（复用已有逻辑）→ BeautifulSoup 解析 → html2text 转 Markdown → 截断 4000 字符
- [x] 1.4 处理非 HTML 响应（JSON/text 直接截断，二进制返回不支持提示）
- [x] 1.5 在 `sandbox.py` 为 `fetch_url` 添加风险规则（默认 LOW）
- [x] 1.6 前端 AbilitiesPanel 注册 fetch_url 展示（服务端执行标签）

## 2. python_repl 工具（服务端 + 容器隔离）

- [x] 2.1 后端 requirements.txt 新增 `docker` SDK 依赖
- [x] 2.2 创建 Python 沙盒 Dockerfile（基础镜像 + numpy/pandas/matplotlib/scipy/sympy）
- [x] 2.3 实现容器执行模块 `backend/app/services/tools/container.py`：Docker SDK 创建临时容器、挂载代码、收集 stdout/stderr、超时 30s 销毁
- [x] 2.4 容器安全限制：`--network=none`、`--memory=256m`、`--cpus=0.5`、`--read-only`（/tmp 可写）
- [x] 2.5 在 `definitions.py` 注册 `python_repl` 工具定义（executor: server）
- [x] 2.6 在 `server_tools.py` 实现 `execute_python_repl`：调用 container 模块执行代码
- [x] 2.7 在 `sandbox.py` 为 `python_repl` 添加风险规则：静态分析代码内容，含 os.system/subprocess 等标 HIGH，默认 MEDIUM
- [x] 2.8 启动时异步检测 Docker 可用性 + 预拉取沙盒镜像
- [x] 2.9 Docker 不可用时禁用工具并返回明确错误
- [x] 2.10 前端 AbilitiesPanel 注册 python_repl 展示（服务端执行标签）

## 3. 服务端工具统一容器化

- [ ] 3.1 重构 `server_tools.py` 的 `execute_server_tool` 分发逻辑，所有服务端工具通过容器执行模块运行
- [ ] 3.2 为 web_search、http_request、memory_* 等已有服务端工具适配容器执行
- [ ] 3.3 确保前端「执行环境」设置不影响服务端工具行为

## 4. search_knowledge_base — 本地检索引擎（客户端）

- [ ] 4.1 前端依赖安装：`better-sqlite3`、`sqlite-vec`、`pdf-parse`、`chokidar`
- [ ] 4.2 Electron 主进程实现知识库索引模块：SQLite 初始化（FTS5 表 + sqlite-vec 表）
- [ ] 4.3 实现文件解析器：pdf-parse（PDF）、fs（MD/TXT），不支持的类型跳过并警告
- [ ] 4.4 实现文本分块逻辑：段落优先 + 512 tokens 窗口 + 128 overlap
- [ ] 4.5 实现 Embedding 调用模块：优先用户自定义配置 → 服务端默认配置 → 未配置报错
- [ ] 4.6 实现首次全量索引构建：扫描 knowledge/ 目录 → 解析 → 分块 → embedding → 写入 SQLite
- [ ] 4.7 实现 chokidar watch 增量更新：文件新增/修改/删除 → 增量更新对应 chunks
- [ ] 4.8 实现混合检索函数：FTS5 BM25 查询 + sqlite-vec 向量查询 → 合并排序 → 返回 top-K
- [ ] 4.9 注册 IPC handler：`knowledge:search`、`knowledge:hasIndex`，暴露为 `nekoBridge.knowledge.*`
- [ ] 4.10 前端设置面板新增知识库目录配置项

## 5. search_knowledge_base — 云端检索（服务端）

- [ ] 5.1 服务端实现文件上传 API（存储到 `storage/{user_id}/knowledge/`）
- [ ] 5.2 服务端容器内实现索引构建（复用分块 + embedding 逻辑）
- [ ] 5.3 服务端实现混合检索函数
- [ ] 5.4 在 `definitions.py` 注册 `search_knowledge_base` 工具定义（executor: server）
- [ ] 5.5 在 `server_tools.py` 实现 `execute_search_knowledge_base`

## 6. search_knowledge_base — 动态路由

- [ ] 6.1 `tools_node` 新增动态 executor 路由：收到 search_knowledge_base 调用时，先向客户端查询 `check_local_index`
- [ ] 6.2 实现本地优先 + 云端 fallback 逻辑：本地有结果直接返回，本地无结果 fallback 到服务端
- [ ] 6.3 前端 WebSocket handler 处理 `check_local_index` 事件并回复
- [ ] 6.4 前端 AbilitiesPanel 注册 search_knowledge_base 展示（动态路由标签）

## 7. Embedding 配置体系

- [ ] 7.1 服务端新增默认 embedding 模型配置项（config.py / .env）
- [ ] 7.2 前端设置面板新增 embedding 模型自定义配置（provider + model + API key）
- [ ] 7.3 实现 embedding 配置解析优先级：用户自定义 → 服务端默认 → 未配置报错
