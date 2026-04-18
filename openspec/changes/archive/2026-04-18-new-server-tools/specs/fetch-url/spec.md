## ADDED Requirements

### Requirement: URL 内容获取与清洗
系统 SHALL 获取指定 URL 的网页内容，清洗 HTML 为 Markdown 纯文本后返回。

#### Scenario: 正常网页获取
- **WHEN** Agent 调用 `fetch_url` 工具并提供 URL
- **THEN** 系统 SHALL 发送 GET 请求获取页面内容，使用 BeautifulSoup 解析 + html2text 转换为 Markdown，截断至 4000 字符后返回

#### Scenario: SSRF 防护
- **WHEN** 提供的 URL 解析后指向私网 IP（192.168.*、10.*、172.16-31.*、127.0.0.1、::1）或 localhost
- **THEN** 系统 SHALL 拒绝请求并返回安全错误，复用 `http_request` 已有的私网 IP 检查逻辑

#### Scenario: 请求超时
- **WHEN** 目标 URL 响应超过 15 秒
- **THEN** 系统 SHALL 中断请求并返回超时错误

#### Scenario: 非 HTML 内容
- **WHEN** 响应的 Content-Type 不是 text/html（如 JSON、纯文本、PDF）
- **THEN** 系统 SHALL 直接返回响应体文本（JSON/text 截断至 4000 字符），PDF 等二进制内容返回不支持提示

### Requirement: fetch_url 优先于 http_request
系统 SHALL 通过工具 description 引导 LLM 在获取网页内容时优先选择 `fetch_url`。

#### Scenario: 描述引导
- **WHEN** 工具注册时
- **THEN** `fetch_url` description SHALL 包含"获取任何 URL 内容时优先使用此工具"；`http_request` description SHALL 收窄为"仅在需要自定义请求方法/Header/Body 或调用 REST API 时使用"
