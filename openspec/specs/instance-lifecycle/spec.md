## ADDED Requirements

### Requirement: Instance CRUD operations
The system SHALL support creating, reading, updating, and soft-deleting AI instances (猫咪/Neko).

#### Scenario: Creating a new instance
- **WHEN** a user submits instance creation form with name, slug, cluster, image version, and resource config
- **THEN** the system SHALL create an Instance record with status "creating"
- **THEN** the slug SHALL be validated against K8s namespace naming constraints (max 63 chars)

#### Scenario: Listing instances
- **WHEN** a user requests the instance list
- **THEN** the system SHALL return all non-deleted instances in the user's organization
- **THEN** each instance SHALL include its current cat state mapping

#### Scenario: Soft-deleting an instance
- **WHEN** a user deletes an instance
- **THEN** the system SHALL set `deleted_at = now()` (soft delete)
- **THEN** the system SHALL trigger K8s resource cleanup asynchronously

### Requirement: Instance state machine
The system SHALL maintain instance states: creating, pending, deploying, running, learning, restarting, updating, failed, deleting. Each state SHALL map to a cat behavioral state for UI display.

#### Scenario: State transition from deploying to running
- **WHEN** the K8s deployment reports all pods ready
- **THEN** instance status SHALL transition to "running"
- **THEN** the cat state SHALL be "Awake" (清醒活跃)

#### Scenario: State transition to failed
- **WHEN** a K8s deployment fails or pods crash
- **THEN** instance status SHALL transition to "failed"
- **THEN** the cat state SHALL be "Unwell" (不舒服)

### Requirement: Instance resource configuration
The system SHALL support configuring CPU request/limit, memory request/limit, storage size, replicas, and compute provider (k8s or docker-local) per instance.

#### Scenario: Setting resource limits
- **WHEN** a user configures instance resources
- **THEN** the system SHALL validate that limits >= requests
- **THEN** the system SHALL apply these as K8s resource requests/limits on the pod spec

### Requirement: Instance member management
The system SHALL support assigning members to specific instances with roles: admin, editor, user, viewer.

#### Scenario: Adding a member to an instance
- **WHEN** an instance admin adds a new member
- **THEN** the system SHALL create a membership record with the specified role
