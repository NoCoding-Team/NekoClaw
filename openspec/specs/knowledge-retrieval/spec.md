# knowledge-retrieval

~~本地知识库检索能力已废弃，相关功能由 hybrid-search-llamaindex 中的 `search_memory` 工具替代。~~

---

## Overview

知识库检索功能（`search_knowledge_base` 工具、本地 SQLite 知识库索引、Electron 本地检索路由）已在 memory-rag-llamaindex 变更中全部移除，由服务端 LlamaIndex 混合检索（`search_memory` 工具）统一替代。

---

## Requirements

_所有需求已移除。_

### ~~Requirement: 混合检索（BM25 + Vector）~~
**已移除**。知识库功能不再需要，`search_knowledge_base` 工具已被 `search_memory` 替代。迁移：使用 `hybrid-search-llamaindex` 中的 `search_memory` 工具。

### ~~Requirement: 本地优先 + 云端 Fallback 路由~~
**已移除**。不再需要客户端本地索引路由，所有检索在服务端完成。迁移：`search_memory` 直接走服务端 LlamaIndex 检索，无 client-first 逻辑。

### ~~Requirement: 本地知识库索引构建~~
**已移除**。Electron 客户端不再维护本地知识库索引。迁移：移除 desktop 端所有 knowledge 相关 IPC handler。

### ~~Requirement: 云端知识库索引~~
**已移除**。服务端知识库索引不再需要。迁移：移除 knowledge.py、api/knowledge.py、storage/{user_id}/knowledge.db。
