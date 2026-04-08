## ADDED Requirements

### Requirement: Tauri 2 desktop application skeleton
The system SHALL provide a `nekoclaw-desktop/` Tauri 2 project that packages the NekoClaw Portal as a cross-platform desktop application (Windows, macOS, Linux). The application SHALL use a lightweight Vue 3 shell as its frontend and load the configured Backend URL in a WebView.

#### Scenario: Application launches with no account configured
- **WHEN** the application starts for the first time (no accounts stored)
- **THEN** the application SHALL display the ConfigView (account configuration page)
- **THEN** the window SHALL be sized at minimum 480×600 px for the config form

#### Scenario: Application launches with account configured
- **WHEN** the application starts and at least one account is configured
- **THEN** the application SHALL navigate directly to PortalView with the active account's Backend URL
- **THEN** the window SHALL be sized at a comfortable default (1280×800 px)

#### Scenario: Application window management
- **WHEN** the user closes the main window
- **THEN** the application SHALL minimize to system tray instead of quitting
- **WHEN** the user quits from the tray menu
- **THEN** the application SHALL exit cleanly

#### Scenario: Window title includes active account name
- **WHEN** an account is active in PortalView
- **THEN** the window title SHALL be `NekoClaw — <account name>`
- **WHEN** no account is active (ConfigView)
- **THEN** the window title SHALL be `NekoClaw`
