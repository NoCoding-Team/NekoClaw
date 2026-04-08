## 1. 项目脚手架

- [x] 1.1 在 `nekoclaw-desktop/` 初始化 Tauri 2 项目（`npm create tauri-app`），选 Vue 3 + TypeScript 模板
- [x] 1.2 添加 Tauri 官方插件依赖：`plugin-store`、`plugin-credentials`、`plugin-autostart`、`plugin-updater`、`plugin-notification`
- [x] 1.3 配置 `tauri.conf.json`：窗口默认尺寸 1280×800，最小 480×600，禁用 decorations 以外的默认选项，设置 `productName: NekoClaw`
- [x] 1.4 配置 `capabilities/default.json`：声明各插件所需权限（store、credentials、autostart、updater、shell-open）
- [x] 1.5 在 `nekoclaw-desktop/src/` 设置 Vue Router 和 Pinia，配置基础路由 `/config` 和`/portal`

## 2. Rust 后端层（src-tauri）

- [x] 2.1 实现 Tauri command `get_accounts() -> Vec<Account>` — 从 store 读取账号列表
- [x] 2.2 实现 Tauri command `save_account(account: Account) -> Result<()>` — 写入账号到 store，Token 存 keychain
- [x] 2.3 实现 Tauri command `delete_account(id: String) -> Result<()>` — 从 store 和 keychain 删除账号
- [x] 2.4 实现 Tauri command `get_token(account_id: String) -> Result<String>` — 从 keychain 读 Token
- [x] 2.5 实现 Tauri command `get_autostart() -> bool` — 返回 OS 当前自启状态
- [x] 2.6 实现 Tauri command `set_autostart(enabled: bool) -> Result<()>` — 设置 OS 自启
- [x] 2.7 在 `lib.rs` 注册系统托盘：图标 + 菜单（显示/隐藏、设置、退出）
- [x] 2.8 监听窗口 `close-requested` 事件，改为最小化到托盘而非退出

## 3. 前端壳 — ConfigView（账号配置页）

- [x] 3.1 创建 `src/views/ConfigView.vue`：表单包含「账号名称」「Backend URL」「API Token（可选）」
- [x] 3.2 实现 URL 合法性校验（必须为 http:// 或 https://，非空）
- [x] 3.3 实现账号列表展示（卡片列表，含编辑、删除、设为活跃按钮）
- [x] 3.4 调用 `save_account` / `delete_account` Tauri command 对接持久化
- [x] 3.5 保存成功后路由跳转到 PortalView（传入 backendUrl）

## 4. 前端壳 — PortalView（WebView 嵌入页）

- [x] 4.1 创建 `src/views/PortalView.vue`：使用 Tauri `<webview>` 标签嵌入 Backend URL 对应的 Portal（`<backendUrl>/`）
- [x] 4.2 顶部显示轻量账号切换栏（账号名 + 切换图标），点击打开账号选择 dropdown
- [x] 4.3 切换账号时刷新 webview src 并更新窗口标题
- [x] 4.4 处理 webview 加载失败（网络错误、服务不可达），展示友好错误提示和「重试」按钮

## 5. 前端壳 — Settings 页

- [x] 5.1 创建 `src/views/SettingsView.vue`：包含「开机自启」开关
- [x] 5.2 进入 Settings 时读取 `get_autostart()` 赋值给开关初始状态
- [x] 5.3 拨动开关时调用 `set_autostart(enabled)` Tauri command
- [x] 5.4 在 `src/App.vue` 中监听托盘菜单「Settings」事件，路由到 SettingsView

## 6. 系统托盘与窗口行为

- [x] 6.1 准备 NekoClaw 猫爪托盘图标（PNG 32×32、64×64），放入 `src-tauri/icons/`（含 README.md 生成说明）
- [ ] 6.2 验证 Windows 托盘图标显示正常（`.ico` 格式转换）
- [ ] 6.3 验证 macOS Dock 图标和托盘图标均正常（`.icns` 格式）
- [ ] 6.4 验证 Linux AppIndicator 托盘显示（Ubuntu 22.04 + GNOME）

## 7. 自动更新

- [x] 7.1 在 `tauri.conf.json` 配置 updater 端点（指向 GitHub Releases `latest.json` URL）
- [x] 7.2 在应用启动后（`onMounted` in App.vue）调用 `@tauri-apps/plugin-updater` 执行 silent check
- [x] 7.3 发现新版本时展示 toast 通知：「发现新版本 vX.Y.Z，点击安装」
- [x] 7.4 用户确认后调用 `update.downloadAndInstall()`，完成后提示重启

## 8. CI/CD — GitHub Actions 多平台发布

- [x] 8.1 在根目录创建 `.github/workflows/desktop-release.yml`，触发条件：`push: tags: ['v*.*.*']`
- [x] 8.2 配置 matrix 策略：`windows-latest`（exe）、`macos-latest`（dmg x86_64 + aarch64，分两个 job）、`ubuntu-22.04`（AppImage + deb）
- [x] 8.3 每个 job：安装 Rust stable、Node 18、Tauri CLI 2；从 secrets 读取 `TAURI_PRIVATE_KEY` 和 `TAURI_KEY_PASSWORD` 作环境变量
- [x] 8.4 各 job 产出产物 upload-artifact，最终 job 汇总并调用 `gh release create` 或 `softprops/action-gh-release` 发布
- [x] 8.5 生成 `latest.json`（Tauri updater schema）并上传至 Release Assets
- [x] 8.6 在 `nekoclaw-desktop/README.md` 中记录：如何生成 Tauri key pair、如何配置 GitHub Secrets

## 9. 集成验证

- [ ] 9.1 本地 `npm run tauri dev` 验证无编译错误，ConfigView 账号增删改查正常
- [ ] 9.2 配置本地 nekoclaw-backend（docker compose up），验证 PortalView 正确加载 Portal 页面
- [ ] 9.3 验证关闭窗口 → 托盘保留 → 托盘点击 → 窗口还原
- [ ] 9.4 验证开机自启开关在 Windows 上生效（注册表 `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`）
- [ ] 9.5 使用 `npm run tauri build` 本地生成安装包，验证 installer 安装/卸载流程

## 10. 文档与发布

- [x] 10.1 在根 `README.md` 项目结构中新增 `nekoclaw-desktop/` 条目说明
- [x] 10.2 在 `docs/quick-start.md` 新增「桌面客户端」章节：下载地址、首次配置步骤
- [x] 10.3 在 `docker-compose.yml` 注释中标注：桌面客户端连接后端时 Backend URL 填入 `http://localhost:8000`
