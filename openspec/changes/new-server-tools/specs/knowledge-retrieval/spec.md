## ADDED Requirements

### Requirement: 混合检索（BM25 + Vector）
系统 SHALL 提供关键词检索与向量检索的混合搜索能力，返回按相关度排序的文档片段。

#### Scenario: 正常检索
- **WHEN** Agent 调用 `search_knowledge_base` 工具并提供查询文本
- **THEN** 系统 SHALL 同时执行 BM25 关键词检索和向量近似检索，合并两路结果后按综合得分排序，返回 top-K 文档片段（默认 K=5）

#### Scenario: 无匹配结果
- **WHEN** 检索无任何匹配（两路结果均为空或得分低于阈值）
- **THEN** 系统 SHALL 返回空结果列表和"未找到相关内容"提示

### Requirement: 本地优先 + 云端 Fallback 路由
系统 SHALL 根据本地索引状态动态选择执行端：本地有索引优先查本地，本地无结果再查云端。

#### Scenario: 本地有索引且有结果
- **WHEN** 客户端本地存在知识库索引，且检索到有效结果
- **THEN** 系统 SHALL 直接返回本地检索结果，不查询云端

#### Scenario: 本地有索引但无结果
- **WHEN** 客户端本地存在知识库索引，但检索无结果
- **THEN** 系统 SHALL fallback 到服务端云端检索，返回云端结果

#### Scenario: 本地无索引
- **WHEN** 客户端本地不存在知识库索引
- **THEN** 系统 SHALL 直接路由到服务端云端检索

#### Scenario: 本地和云端均无索引
- **WHEN** 本地无索引且服务端也无该用户的云端索引
- **THEN** 系统 SHALL 返回"未配置知识库，请在设置中添加知识库目录或上传文件"

### Requirement: 本地知识库索引构建
系统 SHALL 在 Electron 客户端构建和维护本地知识库索引，使用 SQLite 承载 FTS5（BM25）和 sqlite-vec（向量）。

#### Scenario: 首次全量索引
- **WHEN** 用户配置知识库目录且索引不存在
- **THEN** 系统 SHALL 扫描目录下所有 PDF/MD/TXT 文件，分块后构建 FTS5 + 向量索引并持久化到本地 SQLite 文件

#### Scenario: 增量更新
- **WHEN** 知识库目录中文件发生新增、修改、删除
- **THEN** chokidar 监控 SHALL 触发增量更新：新增文件→索引，修改文件→删旧 chunks 重建，删除文件→清除对应 chunks

#### Scenario: 文件解析
- **WHEN** 索引构建遇到不同文件类型
- **THEN** 系统 SHALL 使用 pdf-parse 解析 PDF、原生 fs 读取 MD/TXT，不支持的文件类型跳过并记录警告

#### Scenario: 文本分块
- **WHEN** 文件内容需要分块
- **THEN** 系统 SHALL 按段落优先 + 固定 token 窗口（512 tokens，128 overlap）分块

### Requirement: 云端知识库索引
系统 SHALL 在服务端为每个用户维护独立的云端知识库索引。

#### Scenario: 文件上传触发索引
- **WHEN** 用户通过 UI 上传文件到云端
- **THEN** 服务端 SHALL 存储文件到 `storage/{user_id}/knowledge/` 并在容器内构建索引

#### Scenario: 用户数据隔离
- **WHEN** 执行云端检索时
- **THEN** 系统 SHALL 仅检索当前用户自己的索引数据，不可跨用户访问

### Requirement: Embedding 模型配置
系统 SHALL 支持分层 embedding 模型配置：服务端默认 + 用户客户端覆盖。

#### Scenario: 使用服务端默认
- **WHEN** 用户未在客户端配置自定义 embedding 模型
- **THEN** 系统 SHALL 使用服务端管理员配置的默认 embedding 模型（如 OpenAI text-embedding-3-small）

#### Scenario: 用户自定义覆盖
- **WHEN** 用户在客户端设置了自定义 embedding 模型和 API key
- **THEN** 系统 SHALL 优先使用用户自定义配置

#### Scenario: 未配置 embedding
- **WHEN** 服务端和客户端均未配置 embedding 模型
- **THEN** 系统 SHALL 返回明确错误"未配置 embedding 模型，无法进行知识库检索"
