## ADDED Requirements

### Requirement: FastAPI application with async lifespan
The backend SHALL use FastAPI with async lifespan management for startup/shutdown, including database connection pooling (asyncpg, pool_recycle=300) and conditional EE model import.

#### Scenario: Application startup
- **WHEN** the backend starts
- **THEN** it SHALL initialize database connections, register OAuth providers, and conditionally import EE models

### Requirement: Service Layer pattern
The backend SHALL organize business logic in Service functions (not classes), each accepting `db: AsyncSession` and business parameters. Routes SHALL only handle HTTP concerns and delegate to services.

#### Scenario: Route delegates to service
- **WHEN** a route handler receives a request
- **THEN** it SHALL extract parameters, call the appropriate service function, and return the response

### Requirement: BaseModel with soft delete
All SQLAlchemy models SHALL extend BaseModel which provides: UUID primary key (String 36), created_at, updated_at, deleted_at (nullable), and soft_delete() method.

#### Scenario: Soft deleting a record
- **WHEN** code calls `record.soft_delete()`
- **THEN** `deleted_at` SHALL be set to `func.now()`
- **THEN** the record SHALL be excluded from default queries

### Requirement: Partial Unique Index for soft delete
All unique constraints SHALL use PostgreSQL Partial Unique Index with `WHERE deleted_at IS NULL` to allow multiple soft-deleted records with the same unique key.

#### Scenario: Re-creating a deleted slug
- **WHEN** a user creates an instance with a slug that was previously soft-deleted
- **THEN** the creation SHALL succeed because the partial index only considers active records

### Requirement: Alembic async migrations
The backend SHALL use Alembic for database migrations with async engine support.

#### Scenario: Running migrations
- **WHEN** `alembic upgrade head` is executed
- **THEN** all pending migrations SHALL be applied to the database

### Requirement: FastAPI dependency injection
The backend SHALL use FastAPI's `Depends()` for dependency injection: `get_db()` for database sessions, `get_current_user()` for authentication, `get_current_org()` for organization resolution.

#### Scenario: Injecting current organization
- **WHEN** a route uses `Depends(get_current_org)`
- **THEN** the dependency SHALL resolve the user's organization using OrgProvider Factory

### Requirement: Unified API response format
All API responses SHALL use `ApiResponse[T]` schema with fields: code, data, message, error_code (optional), message_key (optional).

#### Scenario: Successful API response
- **WHEN** a request succeeds
- **THEN** the response SHALL have code=200 and data containing the result

#### Scenario: Error API response
- **WHEN** a request fails
- **THEN** the response SHALL have appropriate error code, error_code identifier, message_key for i18n, and human-readable message
