# NekoClaw Desktop

基于 Tauri 2 构建的跨平台桌面客户端，让你无需浏览器即可连接访问 NekoClaw 猫窝。

## 功能

- 多账号管理 — 配置多个 Backend 地址，一键切换
- 内嵌门户 — WebView 直接嵌入 NekoClaw 用户门户
- 托盘常驻 — 关闭窗口不退出，托盘菜单快速访问
- 开机自启 — 可选随系统登录自动启动
- 自动更新 — 静默检查 GitHub Releases，一键更新

## 开发环境

**前置准备：**

1. 安装 [Rust](https://rustup.rs)（stable）
2. 安装 Node.js >= 22 + npm >= 10
3. Linux 需额外安装系统依赖：
   ```bash
   sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
   ```

**启动开发模式：**

```bash
cd nekoclaw-desktop
npm install
npm run tauri dev
```

## 生产构建

```bash
npm run tauri build
# 产物位于 src-tauri/target/release/bundle/
```

## 图标准备

构建前必须在 `src-tauri/icons/` 放置所需图标文件。参考 `src-tauri/icons/README.md` 的生成说明。

## 发布流程（GitHub Actions）

推送 `v*.*.*` 格式的 Tag 即可自动触发多平台构建：

```bash
git tag v0.1.0
git push origin v0.1.0
```

构建完成后产生 Release Draft，人工检查后发布。

### 配置 GitHub Secrets

在仓库 Settings → Secrets and Variables → Actions 中配置：

| Secret | 说明 |
|--------|------|
| `TAURI_PRIVATE_KEY` | 应用签名私钥（Base64 内容） |
| `TAURI_KEY_PASSWORD` | 私钥密码 |

**生成 Tauri 签名密钥对：**

```bash
# 安装 Tauri CLI（如未安装）
npm install -g @tauri-apps/cli

# 生成密钥对，交互式设置密码
npx tauri signer generate -w nekoclaw.key

# 输出两个文件：
#   nekoclaw.key        — 私钥（内容粘贴为 TAURI_PRIVATE_KEY）
#   nekoclaw.key.pub    — 公钥（填入 tauri.conf.json 的 pubkey 字段）
```

将 `nekoclaw.key` 的内容（Base64 字符串）粘贴到 `TAURI_PRIVATE_KEY`，公钥内容填入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` 字段。

> **安全提示**：私钥文件不要提交到 Git 仓库。
