## ADDED Requirements

### Requirement: FeatureGate directory detection
The system SHALL detect the `ee/` directory at startup to determine edition (CE or EE). If `ee/` exists, edition is "ee"; otherwise "ce".

#### Scenario: CE mode when ee/ absent
- **WHEN** the application starts without an `ee/` directory
- **THEN** FeatureGate SHALL report edition as "ce"
- **THEN** all EE-only features SHALL be disabled

#### Scenario: EE mode when ee/ present
- **WHEN** the application starts with an `ee/` directory present
- **THEN** FeatureGate SHALL report edition as "ee"
- **THEN** all features defined in `features.yaml` SHALL be enabled

### Requirement: Feature definition file
The system SHALL load EE feature definitions from `features.yaml` at the project root. Each feature has an `id`, `name`, and `description`.

#### Scenario: Loading features.yaml
- **WHEN** FeatureGate initializes
- **THEN** it SHALL parse `features.yaml` and register all feature IDs
- **THEN** CE features SHALL always return enabled regardless of edition

### Requirement: Four Factory abstraction layers
The system SHALL provide 4 Factory pattern abstractions with CE/EE implementations:
1. DeploymentAdapter (CE: BasicK8sAdapter, EE: FullK8sAdapter)
2. EmailTransport (CE: GlobalSmtpTransport, EE: OrgSmtpTransport)
3. OrgProvider (CE: SingleOrgProvider, EE: MultiOrgProvider)
4. QuotaChecker (CE: NoopQuotaChecker, EE: PlanBasedQuotaChecker)

#### Scenario: Factory returns CE implementation when EE unavailable
- **WHEN** a Factory function is called and EE module import fails (ImportError)
- **THEN** the Factory SHALL return the CE implementation

#### Scenario: Factory returns EE implementation when available
- **WHEN** a Factory function is called and EE module imports successfully
- **THEN** the Factory SHALL return the EE implementation

### Requirement: Hooks event system
The system SHALL provide a lightweight event system where CE code emits events and EE code can register handlers.

#### Scenario: CE emits event with no EE handler
- **WHEN** CE code calls `hooks.emit("instance.adopted", ...)`
- **THEN** the event SHALL be emitted without error even if no handler is registered

#### Scenario: EE registers and receives events
- **WHEN** EE code registers `hooks.on("instance.adopted", audit_handler)`
- **THEN** the handler SHALL be called whenever CE emits that event

### Requirement: EE model registration
The system SHALL conditionally import EE models before `create_all` in the FastAPI lifespan, so EE tables are included in database schema creation.

#### Scenario: EE models imported at startup
- **WHEN** the application starts in EE mode
- **THEN** `ee.backend.models` SHALL be imported before SQLAlchemy `create_all`
- **THEN** EE model tables SHALL be created in the database

### Requirement: Frontend EE route switching
The Portal frontend SHALL use Vite alias to swap `ee-stub.ts` (empty route array) with `ee/frontend/portal/routes.ts` when the `ee/` directory exists at build time.

#### Scenario: CE build excludes EE routes
- **WHEN** building the portal without `ee/` directory
- **THEN** `@/router/ee-stub` SHALL resolve to the stub file exporting an empty array

#### Scenario: EE build includes EE routes
- **WHEN** building the portal with `ee/` directory present
- **THEN** `@/router/ee-stub` SHALL resolve to `ee/frontend/portal/routes.ts`
