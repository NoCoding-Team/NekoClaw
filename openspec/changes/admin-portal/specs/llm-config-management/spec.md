## ADDED Requirements

### Requirement: LLM 配置列表（管理员视角含 API Key）
系统 SHALL 提供 `GET /api/admin/llm-configs` 接口，返回全部 LLM 配置，包含脱敏后的 api_key（仅显示后 4 位，如 `****abcd`）。

#### Scenario: 管理员获取带部分 API Key 的配置列表
- **WHEN** 超级管理员发起 `GET /api/admin/llm-configs`
- **THEN** 返回所有配置，每条含 id、provider、model_name、api_key_masked、is_default

### Requirement: 创建 LLM 配置
系统 SHALL 提供 `POST /api/admin/llm-configs` 接口，接受 provider、model_name、api_key（明文，存储时加密）、base_url（可选）、is_default（可选）。

#### Scenario: 成功创建新配置
- **WHEN** 超级管理员提交 `{provider: "openai", model_name: "gpt-4o", api_key: "sk-xxx"}`
- **THEN** 系统加密存储 api_key，返回 HTTP 201，body 含新配置 id

#### Scenario: 设为默认时自动取消其他默认
- **WHEN** 提交时 `is_default=true`，且已存在其他默认配置
- **THEN** 原默认配置的 `is_default` 被设为 False，新配置成为唯一默认

### Requirement: 更新/删除 LLM 配置
系统 SHALL 提供 `PUT /api/admin/llm-configs/{id}` 和 `DELETE /api/admin/llm-configs/{id}`。删除默认配置时 SHALL 返回 HTTP 400 要求先更换默认。

#### Scenario: 删除非默认配置成功
- **WHEN** 超级管理员删除 `is_default=False` 的配置
- **THEN** 配置被物理删除，返回 HTTP 204

#### Scenario: 删除默认配置被拒绝
- **WHEN** 尝试删除 `is_default=True` 的配置
- **THEN** 返回 HTTP 400 `{"detail": "Cannot delete default config, set another as default first"}`
