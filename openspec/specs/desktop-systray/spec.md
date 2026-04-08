## ADDED Requirements

### Requirement: System tray icon and menu
The system SHALL display a system tray icon when the application is running. The tray menu SHALL allow users to show/hide the main window and quit the application.

#### Scenario: Tray icon is visible when app is running
- **WHEN** the application starts
- **THEN** a tray icon SHALL appear in the system tray / notification area
- **THEN** the icon SHALL use the NekoClaw cat paw icon (PNG, ≥ 32×32)

#### Scenario: User clicks tray icon to show window
- **WHEN** the user left-clicks the tray icon
- **THEN** the main window SHALL appear and be brought to foreground
- **WHEN** the window is already visible
- **THEN** it SHALL be focused/raised

#### Scenario: Tray context menu
- **WHEN** the user right-clicks the tray icon
- **THEN** a context menu SHALL appear with: "Show NekoClaw", "Settings", separator, "Quit"
- **WHEN** "Quit" is selected
- **THEN** the application SHALL exit

### Requirement: Open-at-login (autostart) option
The system SHALL allow users to toggle automatic startup on system login via `@tauri-apps/plugin-autostart`.

#### Scenario: User enables open-at-login
- **WHEN** the user enables "Open at login" in the Settings page
- **THEN** the system SHALL register the application with the OS autostart mechanism
- **THEN** the setting SHALL be persisted to the local store

#### Scenario: User disables open-at-login
- **WHEN** the user disables "Open at login"
- **THEN** the system SHALL unregister the application from the OS autostart mechanism

#### Scenario: Open-at-login reflects current OS state on startup
- **WHEN** the Settings page is opened
- **THEN** the toggle SHALL reflect the actual current OS autostart registration state
