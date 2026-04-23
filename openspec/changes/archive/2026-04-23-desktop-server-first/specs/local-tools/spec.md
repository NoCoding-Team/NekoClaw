## REMOVED Requirements

### 前端记忆工具本地注册
**Reason**: 记忆工具（memory_read/write/search）执行路径统一为服务端，不再需要在客户端本地工具列表中注册
**Migration**: 从 `localTools.ts` 的 `executeLocalTool` 中删除 memory_read、memory_write、memory_search 三个 case，保留 file_read/write/list/delete、shell_exec、browser_* 等本地工具
