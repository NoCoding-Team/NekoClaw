## ADDED Requirements

### Requirement: Tunnel bridge connects to NekoClaw backend and proxies messages to ZeroClaw
The tunnel bridge SHALL establish a persistent WebSocket connection to NekoClaw backend's `/api/v1/tunnel/connect` as a plugin runtime proxy. Upon receiving `chat.request` messages the bridge SHALL forward them via HTTP POST to the ZeroClaw gateway `/webhook` endpoint, and relay ZeroClaw's response back through the tunnel as `chat.response`.

#### Scenario: Bridge starts and connects to tunnel
- **WHEN** the bridge process starts with `NEKOCLAW_BACKEND_URL` and `NEKOCLAW_API_TOKEN` set
- **THEN** it SHALL connect to `/api/v1/tunnel/connect` with the bearer token
- **THEN** it SHALL log the connection URL (without token) at INFO level

#### Scenario: Bridge receives chat.request and proxies to ZeroClaw
- **WHEN** the backend sends a `chat.request` message over the tunnel
- **THEN** the bridge SHALL POST `{"message": "<text>"}` to `ZEROCLAW_GATEWAY_URL/webhook`
- **THEN** the bridge SHALL relay the text response back as a `chat.response` tunnel message
- **THEN** if ZeroClaw returns non-200, the bridge SHALL send a `chat.response` with error content

#### Scenario: Tunnel connection drops and bridge auto-reconnects
- **WHEN** the tunnel WebSocket connection is lost
- **THEN** the bridge SHALL attempt reconnection with exponential backoff (1s base, 30s max)
- **THEN** each reconnect attempt SHALL log a warning with attempt number

### Requirement: Tunnel bridge registers as a Nanobot channel
The tunnel bridge SHALL register itself as a Nanobot channel via `nanobot.channels` entry point, enabling Nanobot instances to receive chat requests from NekoClaw Tunnel without loading TypeScript plugins.

#### Scenario: Nanobot loads the channel on startup
- **WHEN** a Nanobot instance has `nekoclaw-tunnel-bridge` installed
- **THEN** Nanobot SHALL discover the `nekoclaw` channel via the `nanobot.channels` entry point
- **THEN** the channel SHALL connect to NekoClaw Tunnel and receive `chat.request` messages
- **THEN** messages SHALL be dispatched to the Nanobot agent for processing

#### Scenario: Nanobot channel handles no_reply flag
- **WHEN** a `chat.request` has `no_reply: true`
- **THEN** the channel SHALL process the message but SHALL NOT send a `chat.response` back

### Requirement: Bridge CLI entry point
The tunnel bridge SHALL expose a CLI command `nekoclaw-tunnel-bridge` with mandatory `--runtime` flag to select the target runtime.

#### Scenario: CLI starts ZeroClaw bridge
- **WHEN** `nekoclaw-tunnel-bridge --runtime zeroclaw` is executed
- **THEN** the ZeroClawBridge SHALL start and run until interrupted

#### Scenario: CLI with unsupported runtime exits with error
- **WHEN** an unsupported `--runtime <value>` is passed
- **THEN** the CLI SHALL print an error to stderr and exit with code 1
