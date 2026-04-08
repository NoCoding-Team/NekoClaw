## ADDED Requirements

### Requirement: Multi-account local configuration storage
The system SHALL persist account configurations locally using `@tauri-apps/plugin-store`. Each account SHALL store a `name`, `backendUrl`, and an identifier. API Tokens SHALL be stored in the system keychain via `@tauri-apps/plugin-credentials`.

#### Scenario: User adds a new account
- **WHEN** the user fills in account name and Backend URL and clicks "Save"
- **THEN** the system SHALL validate that the Backend URL is a valid HTTP/HTTPS URL
- **THEN** the system SHALL store the account in the local store
- **THEN** the system SHALL navigate to PortalView with the new account active

#### Scenario: User adds an API Token for an account
- **WHEN** the user enters an API Token in the configuration form
- **THEN** the system SHALL store the token in the system keychain keyed by account ID
- **THEN** the token SHALL NOT be stored in plaintext in the JSON store file

#### Scenario: User switches between accounts
- **WHEN** the user selects a different account from the account switcher
- **THEN** PortalView SHALL reload with the newly selected account's Backend URL
- **THEN** the active account ID SHALL be persisted so it survives app restarts

#### Scenario: User deletes an account
- **WHEN** the user clicks "Delete" on an account
- **THEN** the system SHALL remove the account from the store
- **THEN** any stored keychain credentials for that account SHALL be deleted
- **WHEN** the deleted account was the active account
- **THEN** the system SHALL navigate to ConfigView if no accounts remain, else activate the first remaining account

#### Scenario: Configuration survives app restart
- **WHEN** the application is restarted
- **THEN** all previously saved accounts SHALL be loaded
- **THEN** the previously active account SHALL be automatically selected
