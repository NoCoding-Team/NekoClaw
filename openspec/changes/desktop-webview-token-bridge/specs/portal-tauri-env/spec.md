## ADDED Requirements

### Requirement: Tauri 环境检测

Portal 应用 SHALL 在初始化时检测是否运行在 Tauri WebView 中，并将结果全局可用。

#### Scenario: 在 Tauri Desktop 中运行

- **WHEN** Portal 在 Tauri WebView 内打开
- **THEN** `window.__TAURI_INTERNALS__` 存在
- **THEN** Portal 全局环境标志 `isTauriDesktop` 为 `true`

#### Scenario: 在普通浏览器中运行

- **WHEN** Portal 在浏览器直接打开
- **THEN** `window.__TAURI_INTERNALS__` 不存在
- **THEN** `isTauriDesktop` 为 `false`，所有 Tauri 相关代码路径跳过

### Requirement: 接受 Desktop Token 注入

Portal MUST 监听来自 Desktop 的 `nekoclaw:token-inject` postMessage，并将 Token 写入 localStorage。

#### Scenario: 成功接受 Token 注入

- **WHEN** Portal 收到 `{ type: "nekoclaw:token-inject", token: "<jwt>" }` 的 postMessage
- **THEN** Portal 将该 Token 写入 localStorage（使用 Portal 现有的 auth token key）
- **THEN** Portal 触发路由重新评估，跳过登录页进入主界面

#### Scenario: 拒绝非法注入消息

- **WHEN** Portal 收到 type 不是 `nekoclaw:token-inject` 的 postMessage
- **THEN** Portal 忽略该消息，不修改任何状态

#### Scenario: 非 Tauri 环境不监听

- **WHEN** `isTauriDesktop` 为 `false`
- **THEN** Portal MUST NOT 注册 `message` 事件监听器，不接受任何外部 Token 注入

### Requirement: 路由守卫识别已注入 Token

Portal 的路由守卫 SHALL 在 Tauri 环境下，检测 localStorage 中是否已有 Token，有则跳过登录页。

#### Scenario: 已有注入 Token 时跳过登录

- **WHEN** `isTauriDesktop` 为 `true` 且 localStorage 中存在有效 Token
- **THEN** 路由守卫放行，直接进入目标路由
- **THEN** 不显示登录页

#### Scenario: 无 Token 时正常显示登录页

- **WHEN** `isTauriDesktop` 为 `true` 但 localStorage 中无 Token
- **THEN** 路由守卫重定向到登录页，流程与浏览器模式相同

### Requirement: Portal 登录后通知 Desktop 保存 Token

Portal 在 Tauri 环境下成功登录后，SHALL 通过 Tauri invoke 将新 Token 存入 Desktop Keychain。

#### Scenario: 登录成功后同步 Token

- **WHEN** `isTauriDesktop` 为 `true` 且用户在 Portal 内成功登录（获得 JWT）
- **THEN** Portal 调用 `invoke("store_token_in_keychain", { accountId: activeAccountId, token: jwt })`
- **THEN** Desktop Keychain 更新该账号的 Token

#### Scenario: 浏览器环境不调用 Tauri

- **WHEN** `isTauriDesktop` 为 `false`
- **THEN** 登录成功后 Portal 直接将 Token 存入 localStorage，不调用任何 Tauri API
