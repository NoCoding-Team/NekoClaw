## ADDED Requirements

### Requirement: Two-phase async deployment
The system SHALL implement deployment as two phases: synchronous record creation (returning adopt_id immediately) and asynchronous K8s pipeline execution via background task.

#### Scenario: Initiating adoption (deployment)
- **WHEN** a user submits a deployment request (POST /api/v1/adopt)
- **THEN** the system SHALL synchronously create Instance and AdoptRecord
- **THEN** the system SHALL return adopt_id within 2 seconds
- **THEN** the system SHALL launch the async pipeline via asyncio.create_task

### Requirement: 9-step K8s deployment pipeline
The async pipeline SHALL execute 9 sequential K8s operations: precheck, create namespace, create ConfigMap, create PVC, create Deployment, create Service, create Ingress, configure NetworkPolicy, wait for Deployment ready.

#### Scenario: Successful pipeline completion
- **WHEN** all 9 steps complete successfully
- **THEN** the system SHALL update Instance status to "running"
- **THEN** the system SHALL publish a final "success" event

#### Scenario: Pipeline step failure
- **WHEN** any step fails during pipeline execution
- **THEN** the system SHALL update Instance status to "failed"
- **THEN** the system SHALL publish a "failed" event with error details

### Requirement: EventBus SSE real-time progress
The system SHALL use an EventBus (publish-subscribe) to push deployment progress events. A SSE endpoint SHALL stream these events to the frontend.

#### Scenario: Frontend subscribes to adoption progress
- **WHEN** the frontend connects to GET /api/v1/adopt/progress/{adopt_id}
- **THEN** the system SHALL stream SSE events with: step name, status, message, logs, percentage
- **THEN** events SHALL be formatted as `text/event-stream`

#### Scenario: Automatic disconnection on completion
- **WHEN** the deployment completes (success or failed)
- **THEN** the SSE stream SHALL send a terminal event and close the connection

### Requirement: Deployment timeout protection
The frontend SHALL implement a 6-minute timeout for deployment progress.

#### Scenario: Deployment exceeds timeout
- **WHEN** 6 minutes elapse without a terminal status
- **THEN** the frontend SHALL display "领养超时" and abort the SSE connection

### Requirement: Cat-themed hatching animation
The deployment progress UI SHALL use a cat hatching animation: egg cracking → kitten emerging → stretching → awake.

#### Scenario: Viewing adoption progress
- **WHEN** a user views the adoption progress page
- **THEN** the UI SHALL display a cat hatching animation synchronized with pipeline step progress
- **THEN** step labels SHALL use cat-themed terminology
