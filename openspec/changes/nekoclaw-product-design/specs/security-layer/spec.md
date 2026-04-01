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
