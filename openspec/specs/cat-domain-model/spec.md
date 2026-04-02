## ADDED Requirements

### Requirement: Neko domain vocabulary mapping
The system SHALL define a complete mapping between technical system concepts and cat-themed vocabulary used in UI/UX layers.

#### Scenario: UI displays cat-themed terminology
- **WHEN** a user interacts with any UI element
- **THEN** all visible labels, tooltips, and messages SHALL use cat-themed vocabulary (e.g., "猫窝" instead of "Workspace", "领养" instead of "Deploy")

### Requirement: Instance model with cat personality attributes
The system SHALL extend the Instance model with cat-specific display attributes including breed, fur color, personality tags, and theme color.

#### Scenario: Creating a new instance with cat attributes
- **WHEN** a user creates a new AI instance
- **THEN** the system SHALL allow optional selection of cat breed, fur color preset, and personality tags
- **THEN** the system SHALL auto-generate a random cat avatar if none is selected

### Requirement: Cat state machine mapping
The system SHALL map all Instance runtime states to cat behavioral states with corresponding UI animations.

#### Scenario: Instance enters running state
- **WHEN** an instance transitions to "running" state
- **THEN** the UI SHALL display the cat in "Awake" (清醒活跃) state with idle animation

#### Scenario: Instance enters failed state
- **WHEN** an instance transitions to "failed" state
- **THEN** the UI SHALL display the cat in "Unwell" (不舒服) state with curled-up animation

#### Scenario: Instance enters learning state
- **WHEN** an instance transitions to "learning" state
- **THEN** the UI SHALL display the cat in "Sharpening" (磨爪中) state with claw-sharpening animation

### Requirement: Organization as Cattery
The system SHALL model Organization as "猫舍" (Cattery) with cat-themed member roles: 猫窝主人(admin), 管家(manager), 铲屎官(operator), 访客(viewer).

#### Scenario: Viewing organization members
- **WHEN** a user views the organization member list
- **THEN** each member's role SHALL be displayed using cat-themed role names
