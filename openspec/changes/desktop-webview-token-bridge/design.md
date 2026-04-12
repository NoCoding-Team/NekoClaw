## Context

**当前状态：** `PortalView.vue` 使用 `<iframe :src="backend_url + '/'">` 的方式嵌入 Portal，完全依赖用户在 iframe 内手动登录。Rust 层已有完整的 Keychain Token 存取实现（`store_token_in_keychain` / `read_token_from_keychain`），但 Vue 层从未调用 `get_token`，Keychain 功能处于闲置状态。

**约束：**
- Tauri 2 的 WebView 不支持直接操作 iframe 内部内容（跨域限制）
- Portal 运行在独立域名（`backend_url`），Tauri WebView 是另一个 origin
- Token 不能通过 URL 参数传递（Referrer 泄露风险）
- 必须保持 Portal 在浏览器直接访问时的正常登录流程不变

## Goals / Non-Goals

**Goals:**
- Desktop 启动后，已保存 Token 的账号自动进入 Portal，无需手动登录
- Portal 在 Tauri 环境下能感知并接受 Token 注入
- 账号切换时 Token 同步切换，Portal 自动重新加载
- 登录/登出事件在 Portal 和 Desktop 之间双向同步

**Non-Goals:**
- 不改造 Portal 成"原生 Desktop UI"（保持 iframe/WebView 套壳方案）
- 不在 Desktop 中实现独立的 API 调用层（不重复实现已有的 Portal 功能）
- 不支持 Token 自动刷新（刷新逻辑由 Portal 内部的 `auth.ts` 处理）
- 不改变 Portal 在浏览器中的行为

## Decisions

### 决策 1：注入机制选用 `postMessage` 而非 `evaluate_script`

**选择：** 通过 Tauri WebView 向 Portal 发送 `window.postMessage`，Portal 监听消息并写入 localStorage。

**备选方案：** Rust 侧用 `window.eval_script()` 直接操纵 DOM 和 localStorage。

**选择理由：**
- `postMessage` 是标准 Web API，不依赖 Tauri 特定能力，Portal 代码可测试
- `eval_script` 在 Tauri 2 中注入的代码无法访问 WebView 的 JS 上下文（跨进程隔离）
- Portal 侧只需监听 `message` 事件，改动范围小且清晰

**实现：** Rust 层 `inject_token_to_webview` command → 调用 `webview.eval` 执行 `window.postMessage({type:"nekoclaw:token-inject", token:"..."}, "*")` → Portal `main.ts` 注册监听器写入 localStorage

### 决策 2：Portal 环境检测通过 `window.__TAURI_INTERNALS__` 判断

**选择：** 检测 `window.__TAURI_INTERNALS__` 是否存在来判断是否运行在 Desktop 中。

**备选方案：** 自定义 URL 参数 `?desktop=1`，或用户代理字符串检测。

**选择理由：**
- `window.__TAURI_INTERNALS__` 是 Tauri 官方注入的全局对象，准确且无副作用
- URL 参数污染路由，且每次导航都需要保持
- User-agent 可伪造，不可靠

### 决策 3：Token 同步方向

```
Desktop Keychain ──注入──► Portal localStorage (单向，启动时/账号切换时)
Portal auth 事件 ──同步──► Desktop Keychain (反向，Portal 内登录/登出时)
```

Portal 登录后通过 `window.__TAURI_INTERNALS__` 检测环境，调用 Tauri invoke 更新 Keychain。登出时清除 Keychain Token。

### 决策 4：PortalView 保持 WebView 套壳，不改为 Tauri navigate

**选择：** 保留 Vue Router + 路由组件结构，`PortalView.vue` 内用 Tauri WebView API 加载 Portal。

**理由：** 
- PortalView 内还有账号切换 UI（顶栏），需要保持 Vue 组件结构
- Tauri 的 main webview 本身就是运行 Desktop Vue 应用的容器，不能直接 navigate 走

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| Portal origin 限制 `postMessage` 接收 | Portal 监听时校验 `event.source === window`（iframe 同源），或直接接受 `*` origin（仅接受特定 type 消息） |
| Token 存在 localStorage 被 XSS 读取 | 范围局限于 Portal 自身域名，与直接用浏览器访问风险相同，不引入新风险 |
| Portal 不在 Tauri 环境时误触发注入逻辑 | 所有 Tauri 相关代码通过 `window.__TAURI_INTERNALS__` 门控，浏览器环境零影响 |
| 账号切换时 Portal 状态残留（旧 Token） | 切换账号时先清除 Portal localStorage Token，再注入新 Token + 强制重新加载 |
| `evaluate_script` 时序问题（WebView 未完成加载） | 监听 `did-finish-load` 事件后再执行注入，或在 Portal 侧主动发送 ready 信号 |

## Migration Plan

1. 所有改动在新分支开发，Portal 和 Desktop 同步发布
2. 现有登录流程保持不变：Token 注入失败时自动降级为手动登录
3. 无数据迁移需求，Keychain 中已保存的 Token 直接复用

## Open Questions

- Tauri `webview.eval()` 的执行时机：需要在 WebView 的 `DOMContentLoaded` 后执行，还是有专用 hook？（需验证 Tauri 2 API）
- Portal 的 Content Security Policy 是否会阻止 `eval`？（需检查 nginx.conf 的 CSP header 配置）
