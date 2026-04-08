## ADDED Requirements

### Requirement: Automatic application update via Tauri updater
The system SHALL check for new versions on startup using `@tauri-apps/plugin-updater` and the GitHub Releases update endpoint. When a new version is available, a non-intrusive notification SHALL prompt the user to update.

#### Scenario: Update check on application startup
- **WHEN** the application starts and an internet connection is available
- **THEN** the updater SHALL silently check the update endpoint (`latest.json` in GitHub Releases)
- **THEN** the check SHALL not block or delay the main window from appearing

#### Scenario: New version available
- **WHEN** the update check finds a version newer than the current installed version
- **THEN** the system SHALL show a toast or banner notification: "Update available: vX.Y.Z — Click to install"
- **THEN** clicking the notification SHALL trigger download and staged installation

#### Scenario: Update downloaded and ready
- **WHEN** the update package has finished downloading
- **THEN** the system SHALL prompt: "Update ready. Restart NekoClaw to apply."
- **WHEN** the user confirms restart
- **THEN** the application SHALL install the update and relaunch

#### Scenario: No internet or endpoint unreachable
- **WHEN** the update check fails (network error, timeout)
- **THEN** the system SHALL silently swallow the error with no user-facing message
- **THEN** the error SHALL be logged at DEBUG level

### Requirement: GitHub Releases update manifest (latest.json)
The CI/CD pipeline SHALL generate a `latest.json` update manifest in the Tauri updater format and upload it to GitHub Releases alongside the platform installers.

#### Scenario: Manifest contains all platforms
- **WHEN** a release is published
- **THEN** `latest.json` SHALL contain `version`, `notes`, `pub_date`, and `platforms` entries for `windows-x86_64`, `darwin-x86_64`, `darwin-aarch64`, `linux-x86_64`
- **THEN** each platform entry SHALL contain `signature` (`.sig` file content) and `url` pointing to the corresponding installer asset
