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
