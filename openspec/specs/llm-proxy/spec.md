## ADDED Requirements

### Requirement: Multi-provider LLM routing
The LLM Proxy SHALL support routing requests to multiple LLM providers: OpenAI, Anthropic, Gemini, OpenRouter, MiniMax, and custom providers.

#### Scenario: Routing a chat completion request
- **WHEN** an AI instance sends a chat completion request through the proxy
- **THEN** the proxy SHALL authenticate the request using proxy_token
- **THEN** the proxy SHALL route the request to the configured provider
- **THEN** the proxy SHALL support streaming responses

### Requirement: Organization-level quota management
The LLM Proxy SHALL enforce organization-level token quotas (EE feature).

#### Scenario: Request within quota
- **WHEN** an AI instance sends a request and the organization has remaining quota
- **THEN** the proxy SHALL forward the request and deduct used tokens from quota

#### Scenario: Request exceeds quota
- **WHEN** an AI instance sends a request but the organization's quota is exhausted
- **THEN** the proxy SHALL return a 429 error with a cat-themed message ("小猫粮碗空了")

### Requirement: Token usage logging
The LLM Proxy SHALL log all requests with metadata: tokens used, latency, status_code, request_path, provider, model.

#### Scenario: Logging a successful request
- **WHEN** a request completes successfully
- **THEN** the proxy SHALL record input_tokens, output_tokens, latency_ms, provider, model, and status_code

### Requirement: Proxy token authentication
The LLM Proxy SHALL authenticate requests using proxy_token, resolving the associated organization and instance.

#### Scenario: Invalid proxy token
- **WHEN** a request arrives with an invalid or expired proxy_token
- **THEN** the proxy SHALL return 401 Unauthorized
