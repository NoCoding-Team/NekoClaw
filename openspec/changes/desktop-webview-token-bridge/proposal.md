## Why

Desktop 客户端当前通过 iframe 加载 Portal，Token 存储在 Tauri Keychain 中但从未注入到 WebView，导致用户每次启动都要重新登录，且无法利用 Tauri 原生能力（文件系统、通知、快捷键）。已有的 Keychain 基础设施闲置，对接断层阻碍了桌面端体验提升。

## What Changes

- **移除 iframe 套壳**：`PortalView.vue` 不再使用 `<iframe>`，改为 Tauri WebView 直接导航到 Portal URL
- **Token 自动注入**：WebView 导航完成后，Rust 层通过 `evaluate_script` 将 Keychain 中的 JWT 写入 Portal 的 localStorage，实现免登录
- **Portal 环境感知**：Portal 新增 Tauri 环境检测，登录守卫识别已注入的 Token 后跳过登录页
- **Token 双向同步**：Portal 登录/登出时通过 Tauri event 通知 Desktop 同步更新 Keychain
- **新增 `get_token` 前端调用链**：`ConfigView` 保存账号时支持手动输入 Token（已实现），`PortalView` 启动时自动读取并注入

## Capabilities

### New Capabilities

- `desktop-token-injection`: Desktop 启动后自动将 Keychain Token 注入 Portal WebView，实现免登录直达
- `portal-tauri-env`: Portal 感知运行在 Tauri Desktop 环境，适配认证流程和原生事件桥

### Modified Capabilities

（无已有 spec 需要修改）

## Impact

- **nekoclaw-desktop**：`PortalView.vue` 重构（iframe → Tauri WebView 导航），`src-tauri/src/lib.rs` 新增 `inject_token_to_webview` command
- **nekoclaw-portal**：`router/index.ts` 守卫新增 Tauri Token 检测，`stores/auth.ts` 新增登录/登出事件广播
- **依赖**：`@tauri-apps/api/webviewWindow`（已有）、无新增外部依赖
- **安全**：Token 注入通过 `evaluate_script` 写入 localStorage，不经过 URL 参数（避免 Referrer 泄露）
