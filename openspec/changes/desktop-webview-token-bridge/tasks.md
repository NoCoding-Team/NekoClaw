## 1. Portal：Tauri 环境适配

- [x] 1.1 在 `nekoclaw-portal/src/utils/env.ts`（新建）中导出 `isTauriDesktop: boolean`，检测 `window.__TAURI_INTERNALS__`
- [x] 1.2 在 `nekoclaw-portal/src/main.ts` 中，仅当 `isTauriDesktop` 为 `true` 时注册 `message` 事件监听器，接收 `{ type: "nekoclaw:token-inject", token }` 消息并调用 auth store 的 `setTokens`（access token 写入 `portal_token`，无法获得 refresh token 时写空字符串或跳过）
- [x] 1.3 修改 `nekoclaw-portal/src/router/index.ts` 路由守卫：若 `isTauriDesktop` 为 `true` 且 localStorage 中已有 `portal_token`，则放行，不重定向到登录页
- [x] 1.4 修改 `nekoclaw-portal/src/stores/auth.ts` 的 `login` 函数：登录成功后若 `isTauriDesktop`，调用 `invoke("store_token_in_keychain", { accountId, token })` 将 access token 同步到 Keychain
- [x] 1.5 修改 `nekoclaw-portal/src/stores/auth.ts` 的 `logout` 函数：若 `isTauriDesktop`，调用 `invoke("delete_token_from_keychain", { accountId })` 清除 Keychain Token

## 2. Desktop：Token 注入 Rust Command

- [x] 2.1 在 `nekoclaw-desktop/src-tauri/src/lib.rs` 新增 `inject_token_to_webview` Tauri command：接收 `token: String`，调用 `webview_window.eval(&format!("window.postMessage({{type:'nekoclaw:token-inject',token:'{}'}}, '*')", token))`
- [x] 2.2 在 `lib.rs` 的 `run()` 中将 `inject_token_to_webview` 注册到 `invoke_handler`

## 3. Desktop：PortalView Token 注入流程

- [x] 3.1 修改 `nekoclaw-desktop/src/views/PortalView.vue`：iframe 加载完成后（`@load` 事件），调用 `invoke("get_token", { accountId: activeAccountId })` 获取 Token
- [x] 3.2 获取 Token 成功后调用 `invoke("inject_token_to_webview", { token })`，将 Token 注入到 iframe 内的 Portal

## 4. Desktop：账号切换时刷新 Token

- [x] 4.1 修改 `nekoclaw-desktop/src/views/PortalView.vue`：监听 `activeAccountId` 变化，账号切换时先短暂清空 portalUrl（触发 iframe 卸载），再设置新账号的 backend_url，重新走注入流程
- [x] 4.2 确保切换账号时旧账号的 `portal_token` 在 iframe 重载时被自然清除（新域名 localStorage 隔离），或在注入前先发送清除消息

## 5. 联调验证

- [ ] 5.1 验证：Desktop 启动 → 已保存 Token 账号 → Portal 直接进主界面（无登录页）
- [ ] 5.2 验证：Desktop 启动 → 无 Token 账号 → Portal 显示登录页 → 登录成功 → Keychain 有 Token
- [ ] 5.3 验证：Portal 内登出 → Keychain Token 被删除 → 重启 Desktop 需重新登录
- [ ] 5.4 验证：切换账号 → Portal 重载 → 新账号 Token 注入 → 进入主界面
- [ ] 5.5 验证：浏览器直接打开 Portal → 流程完全正常，无任何 Tauri 相关报错
