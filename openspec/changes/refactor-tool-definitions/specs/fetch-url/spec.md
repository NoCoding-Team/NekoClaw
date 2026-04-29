## REMOVED Requirements

### Requirement: URL 内容获取与清洗
**Reason**: `fetch_url` 作为独立工具被移除，其功能合并进 `http_request` 工具的 `parse_html=true` 模式。
**Migration**: 使用 `http_request(method="GET", url="...", parse_html=true)` 替代 `fetch_url(url="...")`。清洗逻辑（BeautifulSoup + html2text）保持不变，在 server 端执行。

### Requirement: fetch_url 优先于 http_request
**Reason**: `fetch_url` 不再作为独立工具存在，优先级引导失去意义。
**Migration**: `http_request` 的 description 中 SHALL 说明 `parse_html=true` 用于读取网页内容。

## ADDED Requirements

### Requirement: http_request 的 parse_html 模式
当 `http_request` 的 `parse_html` 参数为 `true` 时，系统 SHALL 对 HTML 响应执行清洗（BeautifulSoup 去噪 + html2text 转 Markdown），行为与原 `fetch_url` 一致。

#### Scenario: parse_html=true 获取网页
- **WHEN** Agent 调用 `http_request(method="GET", url="https://example.com", parse_html=true)` 且响应 Content-Type 为 text/html
- **THEN** 系统 SHALL 使用 BeautifulSoup 移除 script/style/nav/footer/header/noscript/iframe 标签，通过 html2text 转为 Markdown，截断至 4000 字符后返回

#### Scenario: parse_html=true 但响应非 HTML
- **WHEN** `parse_html=true` 但响应 Content-Type 不是 text/html
- **THEN** 系统 SHALL 按原始内容处理：JSON/text 截断至 4000 字符返回，二进制类型返回不支持提示

#### Scenario: parse_html=false 或未指定
- **WHEN** `parse_html` 为 `false` 或未提供
- **THEN** 系统 SHALL 返回原始 HTTP 响应（status_code、headers、body），与当前 `http_request` 行为一致

### Requirement: http_request 的 method 默认值
`http_request` 的 `method` 参数 SHALL 默认为 `"GET"`，不再要求必填。

#### Scenario: 省略 method
- **WHEN** Agent 调用 `http_request(url="https://example.com")` 未指定 method
- **THEN** 系统 SHALL 使用 GET 方法发送请求
