## ADDED Requirements

### Requirement: 知识库本地检索工具
系统 SHALL 在客户端 Electron 主进程注册 `search_knowledge_base` 本地执行路径，通过 IPC 提供给渲染进程。

#### Scenario: 客户端本地检索执行
- **WHEN** tools_node 判定本地有索引并将 `search_knowledge_base` 路由到客户端
- **THEN** 客户端 SHALL 通过 `nekoBridge.knowledge.search(query)` 执行本地 SQLite 混合检索并返回结果

#### Scenario: 本地索引状态查询
- **WHEN** 服务端发送 `check_local_index` 事件
- **THEN** 客户端 SHALL 检查本地知识库 SQLite 文件是否存在且非空，回复 `has_index: true/false`

#### Scenario: 知识库目录配置
- **WHEN** 用户在设置中配置知识库目录路径
- **THEN** 系统 SHALL 保存路径到本地配置，并触发首次全量索引构建
