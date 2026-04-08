## Why

NekoClaw 目前只提供 Web 访问方式，用户需要自行配置服务器地址和 Token，体验门槛高。桌面客户端可将 Portal 打包为原生应用，提供系统托盘、本地配置存储和一键连接，降低使用门槛，尤其面向非技术用户。

## What Changes

- 新增 `nekoclaw-desktop/` — 基于 Tauri 2 的跨平台桌面客户端（Windows / macOS / Linux）
- 客户端内嵌 WebView，渲染远端或本地部署的 nekoclaw-portal
- 提供本地配置文件管理（Backend URL + API Token），支持多账号切换
- 提供系统托盘图标（最小化到托盘、开机自启）
- 提供自动更新机制（Tauri updater）
- CI/CD：GitHub Actions 在 tag 推送时自动构建并发布 `.exe` / `.dmg` / `.AppImage` / `.deb`

## Capabilities

### New Capabilities

- `desktop-app`: Tauri 2 桌面客户端骨架，包含窗口管理、WebView 嵌入、应用生命周期
- `desktop-config`: 本地配置持久化（多账号 Backend URL + API Token）与账号切换面板
- `desktop-systray`: 系统托盘图标、开机自启、最小化到托盘
- `desktop-updater`: 基于 Tauri updater 的自动更新，连接 GitHub Releases
- `desktop-ci`: GitHub Actions 多平台构建（Windows / macOS / Linux）并发布 Release

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **新目录**：`nekoclaw-desktop/`（独立 Tauri 项目，Rust + TypeScript 前端壳）
- **前端**：nekoclaw-portal 无需改动；客户端通过配置的 Backend URL 访问 Portal
- **后端**：无需改动
- **CI/CD**：新增 `.github/workflows/desktop-release.yml`
- **构建依赖**：Rust 工具链（stable）、Node.js 18+、Tauri CLI 2.x
- **发布目标**：GitHub Releases，托管 `.exe`（NSIS installer）、`.dmg`、`.AppImage`、`.deb`
