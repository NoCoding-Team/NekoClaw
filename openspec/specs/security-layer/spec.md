## ADDED Requirements

### Requirement: Tool call interception and forwarding
The security layer SHALL intercept all AI tool calls (before and after execution) and forward them to the backend security evaluation service via WebSocket.

#### Scenario: Tool call intercepted before execution
- **WHEN** an AI instance calls a tool
- **THEN** the security layer SHALL send a before_tool_call event to the backend via WebSocket
- **THEN** the backend SHALL evaluate the call and return allow/deny verdict

#### Scenario: Tool call intercepted after execution
- **WHEN** a tool call completes execution
- **THEN** the security layer SHALL send an after_tool_call event with the result

### Requirement: Multi-runtime support
The security layer SHALL support three runtime implementations: TypeScript (via Hook), Python (via monkey-patch), Rust (via trait wrapper).

#### Scenario: TypeScript runtime interception
- **WHEN** running on an OpenClaw instance
- **THEN** the security layer SHALL register before_tool_call / after_tool_call hooks as a plugin

#### Scenario: Python runtime interception
- **WHEN** running on a Nanobot instance
- **THEN** the security layer SHALL monkey-patch ToolRegistry.execute

### Requirement: Kill switch and graceful degradation
The security layer SHALL support a kill switch (`SECURITY_LAYER_ENABLED=false`) and SHALL fallback to no-evaluation mode if the backend is unreachable.

#### Scenario: Backend unreachable
- **WHEN** the security WebSocket connection to the backend fails
- **THEN** the security layer SHALL allow tool calls to proceed without evaluation (fail-open)
- **THEN** the security layer SHALL log a warning

#### Scenario: Kill switch disabled
- **WHEN** `SECURITY_LAYER_ENABLED=false` is set
- **THEN** all tool calls SHALL bypass the security layer entirely

### Requirement: OpenClaw security layer plugin package (openclaw-security-layer)
The system SHALL provide a standalone TypeScript package `openclaw-security-layer` installable as an OpenClaw plugin. The plugin SHALL intercept all tool calls via `api.on("before_tool_call")` and `api.on("after_tool_call")` hooks and delegate evaluation to the backend security WebSocket.

#### Scenario: Plugin registers hooks on startup
- **WHEN** OpenClaw loads the security layer plugin with `SECURITY_LAYER_ENABLED` not set to `false`
- **THEN** the plugin SHALL connect to `SECURITY_WS_ENDPOINT` (or derived from `NEKOCLAW_BACKEND_URL`)
- **THEN** the plugin SHALL register `before_tool_call` and `after_tool_call` event hooks

#### Scenario: Tool call blocked by security evaluation
- **WHEN** the backend security WS returns `action: "deny"` for a before_tool_call event
- **THEN** the plugin SHALL return `{ block: true, blockReason: "<message>" }` to prevent the call
- **THEN** the blocking reason SHALL be the backend's `message` field, falling back to `reason`

#### Scenario: Tool call parameters modified by security evaluation
- **WHEN** the backend security WS returns `action: "modify"` with `modifiedParams`
- **THEN** the plugin SHALL return `{ params: modifiedParams }` to substitute original parameters

### Requirement: Nanobot security layer Python package (nanobot-security-layer)
The system SHALL provide a Python package `nanobot-security-layer` that monkey-patches `nanobot.agent.tools.registry.ToolRegistry.execute` to route all tool calls through backend security evaluation via WebSocket.

#### Scenario: Security layer injected before Nanobot starts
- **WHEN** `inject_security_layer()` is called once before Nanobot agent loop starts
- **THEN** `ToolRegistry.execute` SHALL be wrapped with a security-checking decorator
- **THEN** the patch SHALL set `_security_patched = True` to prevent double-patching
- **THEN** it SHALL connect to `SECURITY_WS_ENDPOINT` (or derived from `NEKOCLAW_BACKEND_URL`)

#### Scenario: Tool call denied by Python security layer
- **WHEN** the backend returns `BeforeAction.DENY` for a tool call
- **THEN** the patched execute SHALL return an error string without calling the original function
- **THEN** the error SHALL indicate the call was blocked by security policy

#### Scenario: Nanobot security layer is disabled
- **WHEN** `SECURITY_LAYER_ENABLED=false` is set
- **THEN** `inject_security_layer()` SHALL be a no-op and log an INFO message

### Requirement: ZeroClaw security layer Rust crate (zeroclaw-security-layer)
The system SHALL provide a Rust crate `zeroclaw-security-layer` exposing a `SecuredTool` trait wrapper and `inject_security_layer()` initializer. The crate SHALL connect to the backend security WS and intercept tool executions via the wrapped trait.

#### Scenario: Security layer initialized in ZeroClaw application
- **WHEN** the ZeroClaw host application calls `inject_security_layer()`
- **THEN** the crate SHALL create an async WebSocket client connecting to `SECURITY_WS_ENDPOINT`
- **THEN** subsequent `SecuredTool::execute()` calls SHALL send before/after events to the backend

#### Scenario: ZeroClaw tool blocked by security evaluation
- **WHEN** the backend returns `action: "deny"` before a tool execution
- **THEN** `SecuredTool::execute()` SHALL return an `Err` with the deny message
- **THEN** the original tool function SHALL NOT be called

#### Scenario: ZeroClaw security layer graceful degradation
- **WHEN** the WebSocket connection to the backend is unavailable
- **THEN** the security layer SHALL log a warning and allow all tool calls to proceed
- **THEN** the crate SHALL continue attempting reconnection in the background
