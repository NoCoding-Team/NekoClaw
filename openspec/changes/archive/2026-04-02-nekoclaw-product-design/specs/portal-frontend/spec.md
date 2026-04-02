## ADDED Requirements

### Requirement: Vue 3 SPA with Vite
The portal SHALL be a Vue 3 Single Page Application built with Vite, TypeScript, and Tailwind CSS.

#### Scenario: Development server startup
- **WHEN** running `npm run dev`
- **THEN** the portal SHALL be available at http://localhost:4517 with HMR

### Requirement: Pinia state management
The portal SHALL use Pinia stores for state management: auth (token, user, systemInfo), org (currentOrg), workspace, cluster, gene.

#### Scenario: Auth store manages login state
- **WHEN** a user logs in successfully
- **THEN** the auth store SHALL store JWT token, user info, and system info (edition, features)

### Requirement: Axios API integration with interceptors
The portal SHALL use Axios with request interceptors (JWT token injection, Accept-Language) and response interceptors (401 redirect, error handling).

#### Scenario: API request with authentication
- **WHEN** the portal makes an API request
- **THEN** the JWT token SHALL be injected into the Authorization header
- **THEN** the current locale SHALL be sent in Accept-Language header

#### Scenario: 401 response handling
- **WHEN** an API response returns 401
- **THEN** the portal SHALL clear stored tokens and redirect to the login page

### Requirement: Route guard for authentication
The portal SHALL implement a navigation guard that redirects unauthenticated users to the login page.

#### Scenario: Unauthenticated access
- **WHEN** an unauthenticated user navigates to a protected route
- **THEN** the router SHALL redirect to /login

### Requirement: Feature gate composable
The portal SHALL provide a `useFeature(featureId)` composable that checks if a feature is enabled based on systemInfo from the auth store.

#### Scenario: Checking EE feature availability
- **WHEN** a component calls `useFeature('multi_org')`
- **THEN** the composable SHALL return `isEnabled: true` in EE mode, `false` in CE mode

### Requirement: EE route stub mechanism
The portal SHALL define `src/router/ee-stub.ts` exporting an empty route array. Vite alias SHALL swap it with EE routes at build time when `ee/` exists.

#### Scenario: CE build route resolution
- **WHEN** building without `ee/` directory
- **THEN** the ee-stub SHALL resolve to an empty array, adding no EE routes
