## ADDED Requirements

### Requirement: 启动时自动注入 Token

Desktop 应用启动并激活账号后，SHALL 自动将 Keychain 中存储的 JWT Token 通过 `postMessage` 注入到 Portal WebView 的 localStorage，无需用户手动登录。

#### Scenario: 有效 Token 注入成功

- **WHEN** 用户打开 Desktop，且 activeAccount 对应的 Keychain Token 存在且非空
- **THEN** Portal WebView 加载完成后，localStorage 中 `nekoclaw_token`（或 Portal 使用的实际 key）被写入该 Token
- **THEN** Portal 路由守卫检测到 Token 后跳过登录页，直接进入主界面

#### Scenario: Token 不存在时降级为手动登录

- **WHEN** 用户打开 Desktop，但 activeAccount 在 Keychain 中无对应 Token
- **THEN** Portal 正常显示登录页，用户手动登录
- **THEN** Desktop 不显示错误，不阻塞 Portal 加载

#### Scenario: Token 注入时序保证

- **WHEN** Portal WebView 开始加载 URL
- **THEN** Token 注入 MUST 在 Portal 页面的 `DOMContentLoaded` 事件完成后执行
- **THEN** 如注入脚本执行失败，Desktop 端捕获错误并记录日志，不崩溃

### Requirement: 账号切换时 Token 刷新

当用户在 Desktop 切换到另一个账号时，SHALL 清除当前 Portal WebView 中的旧 Token 并注入新 Token。

#### Scenario: 切换到有 Token 的账号

- **WHEN** 用户从账号 A 切换到账号 B，且账号 B 有 Keychain Token
- **THEN** Portal WebView 重新加载 账号 B 的 backend_url
- **THEN** 加载完成后注入账号 B 的 Token, Portal 自动进入主界面

#### Scenario: 切换到无 Token 的账号

- **WHEN** 用户从账号 A 切换到账号 B，且账号 B 无 Keychain Token
- **THEN** Portal WebView 重新加载 账号 B 的 backend_url，显示登录页

### Requirement: Portal 登出时同步清除 Desktop Token

当用户在 Portal 内点击登出时，SHALL 通知 Desktop 删除 Keychain 中对应账号的 Token。

#### Scenario: Portal 内登出

- **WHEN** 用户在 Portal 内触发登出操作
- **THEN** Portal 通过 Tauri invoke 调用 `delete_token_from_keychain(account_id)`
- **THEN** Desktop Keychain 中该账号的 Token 被删除
- **THEN** 下次启动时该账号需要重新手动登录
