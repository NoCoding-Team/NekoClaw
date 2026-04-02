## ADDED Requirements

### Requirement: OAuth SSO login
The system SHALL support OAuth SSO login with configurable providers (e.g., Feishu/Lark). The flow: authorization code exchange → user creation/update → JWT token issuance.

#### Scenario: First-time OAuth login
- **WHEN** a new user completes OAuth authorization
- **THEN** the system SHALL create a User record, an OAuthConnection, and an OrgMembership
- **THEN** the system SHALL issue a JWT access token and refresh token

#### Scenario: Returning OAuth login
- **WHEN** an existing user completes OAuth authorization
- **THEN** the system SHALL sync user profile info from the OAuth provider
- **THEN** the system SHALL issue new JWT tokens

### Requirement: JWT token authentication
The system SHALL authenticate API requests using JWT Bearer tokens in the Authorization header. Access tokens SHALL expire after 8 hours. Refresh tokens SHALL support token renewal.

#### Scenario: Valid token request
- **WHEN** a request includes a valid JWT in the Authorization header
- **THEN** the system SHALL extract user identity and allow the request

#### Scenario: Expired token request
- **WHEN** a request includes an expired JWT token
- **THEN** the system SHALL return 401 Unauthorized

### Requirement: KubeConfig encryption
The system SHALL encrypt stored KubeConfig data using AES-256-GCM before persisting to the database.

#### Scenario: Storing a cluster KubeConfig
- **WHEN** a user adds a K8s cluster with KubeConfig
- **THEN** the system SHALL encrypt the KubeConfig with AES-256-GCM before database storage

#### Scenario: Using a stored KubeConfig
- **WHEN** the system needs to connect to a K8s cluster
- **THEN** the system SHALL decrypt the KubeConfig at runtime

### Requirement: AuthActor context
The system SHALL maintain an AuthActor context variable (actor_type, actor_id, actor_name) for the current request, supporting both "user" and "agent" actor types.

#### Scenario: User request sets AuthActor
- **WHEN** a user makes an authenticated API request
- **THEN** AuthActor SHALL be set with actor_type="user" and the user's identity

### Requirement: Organization member permissions
The system SHALL support role-based access control with roles: admin (猫窝主人), manager (管家), operator (铲屎官), viewer (访客).

#### Scenario: Viewer attempts destructive action
- **WHEN** a user with "viewer" role attempts to delete an instance
- **THEN** the system SHALL return 403 Forbidden
