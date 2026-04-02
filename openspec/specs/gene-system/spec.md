## ADDED Requirements

### Requirement: Trick (Gene) CRUD
The system SHALL support creating, reading, updating, and soft-deleting Tricks (猫技/Gene) with attributes: name, slug, description, tags, category, version, manifest, dependencies, source, icon, visibility.

#### Scenario: Creating a new trick
- **WHEN** an admin creates a new Trick
- **THEN** the system SHALL store it with a unique slug, version, and category
- **THEN** the Trick SHALL be available for installation on instances

### Requirement: Trick installation on instances
The system SHALL support installing Tricks on AI instances, tracking status: installing, learning, installed, learn_failed, failed, uninstalling, forgetting, forget_failed, simplified.

#### Scenario: Installing a trick on a cat
- **WHEN** a user installs a Trick on an instance
- **THEN** the system SHALL create an InstanceGene record with status "installing"
- **THEN** the system SHALL deliver the learning task to the instance via Learning Channel

### Requirement: Sharpening - trick learning (learn mode)
The system SHALL support a learning flow where an AI instance evaluates and learns a Trick, generating a personalized SKILL.md.

#### Scenario: Cat successfully learns a trick
- **WHEN** an AI instance completes the learning process for a Trick
- **THEN** InstanceGene status SHALL transition to "installed"
- **THEN** the system SHALL store the AI's learning output and self-evaluation

#### Scenario: Learning fails
- **WHEN** an AI instance fails to learn a Trick
- **THEN** InstanceGene status SHALL transition to "learn_failed"
- **THEN** the system SHALL log the failure reason

### Requirement: Doze Off - trick forgetting (forget mode)
The system SHALL support an evaluation flow for long-unused Tricks, where the AI decides to forget or simplify them.

#### Scenario: Cat forgets an unused trick
- **WHEN** the system detects a Trick with low usage_count over time
- **THEN** the system SHALL trigger a forget evaluation task
- **THEN** the AI MAY decide to forget (remove) or simplify (reduce) the Trick

### Requirement: Eureka - trick creation (create mode)
The system SHALL support AI instances creating new Tricks from their work experience.

#### Scenario: Cat creates a new trick from experience
- **WHEN** an AI instance generates a new Trick through the create flow
- **THEN** the system SHALL create a new Gene record with source="agent"
- **THEN** the Trick SHALL be available for publication to the Training Ground

### Requirement: Training Ground (Gene Marketplace)
The system SHALL provide a marketplace (训练场/Training Ground) for browsing, searching, and obtaining Tricks, supporting sources: official, community, agent, manual.

#### Scenario: Browsing the training ground
- **WHEN** a user opens the Training Ground
- **THEN** the system SHALL display available Tricks with name, description, category, install count, and rating

### Requirement: Trick Set (Genome) bundles
The system SHALL support bundling multiple Tricks into a Trick Set (技能套装/Genome) for batch installation.

#### Scenario: Installing a trick set
- **WHEN** a user installs a Trick Set on an instance
- **THEN** the system SHALL install all included Tricks sequentially
- **THEN** any config overrides in the Trick Set SHALL apply

### Requirement: Trick effect logging and rating
The system SHALL track Trick effectiveness via GeneEffectLog and support user ratings via GeneRating.

#### Scenario: Rating a trick
- **WHEN** a user rates a Trick on a specific instance
- **THEN** the system SHALL store the rating and update the aggregate score
