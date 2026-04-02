## ADDED Requirements

### Requirement: Workspace (Nest) CRUD
The system SHALL support creating, reading, updating, and soft-deleting workspaces (猫窝/Nest).

#### Scenario: Creating a new nest
- **WHEN** a user creates a workspace
- **THEN** the system SHALL create a Workspace record with name, description, and organization association

### Requirement: Hexagonal topology with 3D visualization
The system SHALL render workspaces as hexagonal grid topologies using Three.js, where each hex cell can contain a cat (AI instance), a human member, or decoration.

#### Scenario: Viewing the 3D nest
- **WHEN** a user opens a workspace
- **THEN** the system SHALL render a Three.js 3D scene with hexagonal grid layout
- **THEN** each AI instance SHALL be displayed as a cat avatar at its hex position with state animation
- **THEN** human members SHALL be displayed as avatar nodes at their hex positions

### Requirement: Workspace member management
The system SHALL support adding/removing members to workspaces with roles: admin, manager, operator, viewer (猫窝主人/管家/铲屎官/访客).

#### Scenario: Adding a member to a nest
- **WHEN** a workspace admin adds a new member
- **THEN** the system SHALL create a WorkspaceMember record with role and permissions

### Requirement: Notice Board (Blackboard) system
The system SHALL provide a shared document and discussion system within each workspace, consisting of NoticeBoard (shared docs), Posts (discussion threads), and Replies.

#### Scenario: Creating a notice board post
- **WHEN** a member creates a post on the notice board
- **THEN** the system SHALL store the post with Markdown content and author info
- **THEN** other members SHALL see the new post in the notice board

### Requirement: Hunt objectives (OKR system)
The system SHALL support hierarchical objectives (狩猎目标/Hunt) within workspaces, supporting parent-child relationships and progress tracking.

#### Scenario: Creating a hunt objective
- **WHEN** a user creates a new objective
- **THEN** the system SHALL create a WorkspaceObjective with type (OKR/Sprint), progress, and optional parent

### Requirement: Task delegation between humans and cats
The system SHALL support task delegation where any workspace participant (human or AI) can assign tasks to the most suitable participant.

#### Scenario: Delegating a task to a cat
- **WHEN** a human member delegates a task to an AI instance
- **THEN** the task SHALL be delivered to the AI instance via the workspace channel (Cat Flap)

### Requirement: Real-time workspace messaging
The system SHALL support real-time messages within workspaces via WorkspaceMessage model.

#### Scenario: Sending a message in the nest
- **WHEN** a member sends a message in the workspace
- **THEN** all workspace members and connected AI instances SHALL receive the message in real-time
