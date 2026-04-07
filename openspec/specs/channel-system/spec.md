## ADDED Requirements

### Requirement: NekoClaw workspace channel (Cat Flap - Internal)
The system SHALL provide a WebSocket tunnel channel for AI instances to communicate with the workspace backend. Instances SHALL connect outbound to `/api/v1/tunnel/connect` with proxy_token authentication.

#### Scenario: Instance connects via tunnel
- **WHEN** an AI instance starts and connects to the tunnel endpoint
- **THEN** the system SHALL authenticate the proxy_token
- **THEN** a persistent WebSocket connection SHALL be established for bidirectional messaging

#### Scenario: Tunnel auto-reconnect
- **WHEN** the tunnel connection drops
- **THEN** the instance SHALL attempt reconnection with exponential backoff (1s to 30s)

### Requirement: DingTalk channel (Cat Flap - DingTalk)
The system SHALL support DingTalk integration via DingTalk Stream protocol (WebSocket), receiving robot messages (single chat + group @mentions) and replying via sessionWebhook.

#### Scenario: Receiving a DingTalk message
- **WHEN** a user sends a message to the DingTalk bot
- **THEN** the system SHALL forward the message to the connected AI instance
- **THEN** the AI's response SHALL be sent back via sessionWebhook

### Requirement: Learning channel (Cat Flap - Training)
The system SHALL provide a channel for delivering learning tasks (learn/create/forget) to AI instances and receiving results.

#### Scenario: Delivering a learning task
- **WHEN** the backend initiates a Trick learning task
- **THEN** the system SHALL POST the task to the instance's webhook endpoint
- **THEN** the instance SHALL process the task and return results via the send tool

### Requirement: Channel plugin architecture
The system SHALL implement channels as independent plugins, each with its own connection protocol, message handling, and configuration.

#### Scenario: Adding a new channel type
- **WHEN** a new channel plugin is developed
- **THEN** it SHALL be registerable without modifying core channel infrastructure
- **THEN** it SHALL follow the plugin interface: connect, disconnect, send, receive

### Requirement: NekoClaw channel plugin package (openclaw-channel-nekoclaw)
The system SHALL provide a standalone TypeScript package `openclaw-channel-nekoclaw` installable as an OpenClaw plugin. The package SHALL implement the NekoClaw workspace channel by connecting to `/api/v1/tunnel/connect` and SHALL register workspace tools available to the AI instance.

#### Scenario: Plugin registers and starts tunnel connection
- **WHEN** OpenClaw loads the plugin via `register(api)`
- **THEN** the plugin SHALL call `startTunnelClient(api.config)` to establish the tunnel WebSocket
- **THEN** the plugin SHALL register the `nekoclaw` channel via `api.registerChannel()`
- **THEN** the plugin SHALL register tools: `nekoclaw_workspace`, `nekoclaw_gene`, `nekoclaw_topology`, `nekoclaw_instance`

#### Scenario: Plugin injects learning task handler into tunnel
- **WHEN** the plugin initializes
- **THEN** it SHALL attempt to set a learning webhook handler on the tunnel client for gene learning task delivery
- **THEN** if no handler is configured, it SHALL log a warning and continue without error

#### Scenario: Workspace tool resolves correct account from session key
- **WHEN** the tool is called within a session keyed `workspace:<id>`
- **THEN** the tool SHALL resolve the `<id>` as the workspace ID for API calls
- **THEN** API calls SHALL use `apiUrl` and `apiToken` from the matching account config

### Requirement: NekoClaw channel MCP servers
The system SHALL provide two MCP servers (stdio transport) bundled inside `openclaw-channel-nekoclaw/mcp-servers/`:

- `nekoclaw-workspace-tools` — blackboard tasks, objectives, BBS posts
- `nekoclaw-gene-tools` — gene market search, gene detail, install/uninstall, evolution data

#### Scenario: MCP server lists available tools
- **WHEN** an MCP client sends `tools/list`
- **THEN** the server SHALL return the tool list for its domain
- **THEN** all tools SHALL include human-readable descriptions and JSON Schema input schemas

#### Scenario: MCP server proxies API calls
- **WHEN** an MCP client calls a tool
- **THEN** the server SHALL make the corresponding HTTP call to `NEKOCLAW_API_URL`
- **THEN** the server SHALL return the raw API response as JSON text content

### Requirement: DingTalk channel plugin package (openclaw-channel-dingtalk)
The system SHALL provide a standalone TypeScript package `openclaw-channel-dingtalk` implementing DingTalk Stream protocol. The package SHALL connect to DingTalk's WebSocket endpoint using `clientId` and `clientSecret`, receive robot messages, and reply via `sessionWebhook`.

#### Scenario: Plugin connects to DingTalk Stream
- **WHEN** OpenClaw loads the DingTalk plugin with valid `clientId` and `clientSecret`
- **THEN** the plugin SHALL authenticate with DingTalk Open Platform and establish a Stream WebSocket
- **THEN** received single-chat and @mention group messages SHALL be forwarded to the AI instance

#### Scenario: Plugin replies to DingTalk message
- **WHEN** the AI instance produces a response to a DingTalk message
- **THEN** the plugin SHALL POST the reply to the message's `sessionWebhook` URL
- **THEN** the reply SHALL support both text and markdown message types
