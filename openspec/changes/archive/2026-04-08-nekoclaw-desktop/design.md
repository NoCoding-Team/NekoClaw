## Context

NekoClaw 是纯 Web 平台，用户通过浏览器访问部署在服务器上的 nekoclaw-portal。竞品 nodeskclaw 提供了 VibeCraft 桌面客户端（Tauri），用户可直接下载 exe 使用，体验显著更好。

当前约束：
- nekoclaw-portal 已是完整的 Vue 3 SPA，无需大改
- 后端 API 通过 HTTP/WebSocket 与前端通信，天然支持 WebView 内嵌
- 开发机为 Windows（目标产物含 `.exe`），CI 需要 macOS Runner 产出 `.dmg`
- 项目已有 GitHub Actions CI 框架可复用

## Goals / Non-Goals

**Goals:**
- 用 Tauri 2 打包 nekoclaw-portal 为跨平台桌面应用
- 本地持久化多账号配置（Backend URL + API Token）
- 系统托盘：最小化到托盘、开机自启
- 自动更新（Tauri updater 连接 GitHub Releases）
- GitHub Actions 自动多平台构建并发布 Release

**Non-Goals:**
- 内置本地 Docker 启动/管理（超出范围，用户自行部署后端）
- 移动端（iOS/Android）
- nekoclaw-portal 的功能改动
- 离线模式

## Decisions

### 1. 技术框架：Tauri 2（而非 Electron）

| | Tauri 2 | Electron |
|---|---|---|
| 包体 | ~10–15 MB installer | ~150 MB+ |
| 内存 | 系统 WebView（共享） | Chromium 独立进程 |
| 后端语言 | Rust | Node.js |
| 更新机制 | 内置 updater | 需第三方库 |

**决策**：选 Tauri 2。包体小，更新机制内置，与项目技术栈（Rust zeroclaw-security-layer 已有 Rust 代码）一致。

### 2. 前端壳：独立 Vue 3 + Vite（非直接复用 nekoclaw-portal）

桌面客户端有独有 UI（配置页、账号管理、托盘菜单），不能直接绑定 portal 源码。

**方案**：`nekoclaw-desktop/` 下维护一个轻量 Vue 3 壳：
- `ConfigView`：账号列表 + 添加/编辑账号（Backend URL + API Token）
- `PortalView`：`<webview>` 标签嵌入配置的 Backend URL 对应的 Portal（`http://<host>/`）
- 启动时若无账号配置 → 跳转 ConfigView；有配置 → 直接 PortalView

### 3. 配置存储：Tauri `store` 插件（非自写文件 IO）

`@tauri-apps/plugin-store` 提供 JSON 文件存储，自动放在系统 AppData/AppSupport 目录，支持加密。Token 敏感字段使用系统 Keychain（`@tauri-apps/plugin-keychain` 或 `plugin-credentials`）。

### 4. 系统托盘：Tauri `tray` + `autostart` 插件

- 托盘菜单：显示/隐藏窗口、设置、退出
- 开机自启：`@tauri-apps/plugin-autostart`，用户可在设置页开关

### 5. 自动更新：Tauri updater + GitHub Releases

- 更新端点：GitHub Releases 的 `latest.json`（Tauri updater 格式）
- CI 发布时同时生成 `latest.json` 并上传到 Release Assets
- 应用启动时静默检查更新，有新版本时 toast 提示

### 6. CI/CD：GitHub Actions 矩阵构建

平台矩阵：`windows-latest`（`.exe` NSIS installer）、`macos-latest`（`.dmg`）、`ubuntu-22.04`（`.AppImage` + `.deb`）

触发：`v*.*.*` tag 推送（例如 `v0.1.0`）

### 7. 目录结构

```
nekoclaw-desktop/
├── src-tauri/               # Tauri Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/        # Tauri 2 权限声明
│   └── src/
│       ├── main.rs
│       └── lib.rs           # Tauri commands（config read/write, autostart toggle）
├── src/                     # Vue 3 前端壳
│   ├── main.ts
│   ├── App.vue
│   ├── views/
│   │   ├── ConfigView.vue   # 账号配置页
│   │   └── PortalView.vue   # WebView 嵌入页
│   ├── stores/
│   │   └── accounts.ts      # Pinia 账号状态
│   └── router/
│       └── index.ts
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Risks / Trade-offs

- **macOS Gatekeeper 签名** → 未签名的 `.dmg` 在 macOS 15+ 会被拦截。缓解：CI 用免费的 ad-hoc 签名（仅用于自用/内部，外部发布需付费 Apple Developer 账号）。
- **WebView 跨域 / CSP 限制** → `<webview>` 加载外部 URL 受 Tauri capability 控制。需在 `capabilities/` 中声明允许的域（允许所有用户配置的 Backend URL，不能硬编码）。缓解：使用动态 origin 白名单，或配置 `dangerouslyAllowRemoteDomains`（内网场景可接受）。
- **Token 安全** → API Token 若明文存储在 JSON 有泄露风险。缓解：敏感 Token 优先写入系统 Keychain，文件中仅存非敏感元数据。
- **Tauri 2 API 较新** → 插件生态仍在演进，部分社区插件尚未 stable。缓解：只依赖 Tauri 官方一方插件（store、autostart、updater、dialog）。
- **Linux AppImage 托盘** → 部分 Linux 桌面环境（GNOME）默认不显示托盘图标。缓解：文档说明，用户可安装 `gnome-shell-extension-appindicator`。
