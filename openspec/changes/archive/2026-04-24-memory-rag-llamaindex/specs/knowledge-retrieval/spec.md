## REMOVED Requirements

### Requirement: 混合检索（BM25 + Vector）
**Reason**: 知识库功能不再需要，search_knowledge_base 工具被 search_memory 替代
**Migration**: 使用 hybrid-search-llamaindex 中的 search_memory 工具替代

### Requirement: 本地优先 + 云端 Fallback 路由
**Reason**: 不再需要客户端本地索引路由，所有检索在服务端完成
**Migration**: search_memory 直接走服务端 LlamaIndex 检索，无 client-first 逻辑

### Requirement: 本地知识库索引构建
**Reason**: Electron 客户端不再维护本地知识库索引
**Migration**: 移除 desktop 端所有 knowledge 相关 IPC handler

### Requirement: 云端知识库索引
**Reason**: 服务端知识库索引不再需要
**Migration**: 移除 knowledge.py、api/knowledge.py、storage/{user_id}/knowledge.db
