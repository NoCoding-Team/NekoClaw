## ADDED Requirements

### Requirement: Independent Vue 3 project for admin
The admin frontend SHALL be an independent Vue 3 project at `ee/nekoclaw-frontend/` with its own router, stores, and build configuration. It is EE-only.

#### Scenario: Admin development server
- **WHEN** running `npm run dev` in `ee/nekoclaw-frontend/`
- **THEN** the admin SHALL be available at http://localhost:4518

### Requirement: Organization management pages
The admin SHALL provide pages for managing organizations (猫舍/Cattery): list, create, edit, delete, member management.

#### Scenario: Viewing organization list
- **WHEN** a platform admin opens the organizations page
- **THEN** the admin SHALL display all organizations with name, slug, plan, member count

### Requirement: User management pages
The admin SHALL provide pages for managing all users across organizations.

#### Scenario: Viewing all users
- **WHEN** a platform admin opens the users page
- **THEN** the admin SHALL display all users with name, email, organization, role, last login

### Requirement: Plan and quota management
The admin SHALL provide pages for managing subscription plans and quotas.

#### Scenario: Editing a plan's quotas
- **WHEN** a platform admin edits a plan
- **THEN** the admin SHALL allow setting CPU, memory, storage, and instance count limits

### Requirement: shadcn-vue component library
The admin SHALL use shadcn-vue as its UI component library for consistent, accessible components.

#### Scenario: Using shadcn-vue components
- **WHEN** building admin UI pages
- **THEN** developers SHALL use shadcn-vue components (Button, Dialog, Table, Form, etc.)
