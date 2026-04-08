## ADDED Requirements

### Requirement: Multi-platform GitHub Actions release workflow
The CI/CD system SHALL provide a GitHub Actions workflow (`.github/workflows/desktop-release.yml`) that builds native installers for Windows, macOS (x86_64 + aarch64), and Linux on every push of a version tag (`v*.*.*`) and publishes them as GitHub Release assets.

#### Scenario: Release workflow triggered by version tag
- **WHEN** a git tag matching `v*.*.*` is pushed to the repository
- **THEN** the `desktop-release` workflow SHALL be triggered
- **THEN** a GitHub Release SHALL be created (draft → published after all matrix jobs succeed)

#### Scenario: Windows build produces NSIS installer
- **WHEN** the matrix job runs on `windows-latest`
- **THEN** the workflow SHALL produce a `.exe` NSIS installer
- **THEN** the installer SHALL be uploaded to the GitHub Release

#### Scenario: macOS builds produce signed DMG
- **WHEN** the matrix jobs run on `macos-latest` (for x86_64 and aarch64)
- **THEN** the workflow SHALL produce `.dmg` files for both architectures
- **THEN** each `.dmg` SHALL be uploaded to the GitHub Release
- **THEN** the build SHALL use ad-hoc code signing (no Apple Developer certificate required for CE)

#### Scenario: Linux builds produce AppImage and deb
- **WHEN** the matrix job runs on `ubuntu-22.04`
- **THEN** the workflow SHALL produce both `.AppImage` and `.deb` packages
- **THEN** both artifacts SHALL be uploaded to the GitHub Release

#### Scenario: Update manifest generated and uploaded
- **WHEN** all platform jobs complete successfully
- **THEN** the workflow SHALL generate `latest.json` in Tauri updater format
- **THEN** `latest.json` SHALL be uploaded to the GitHub Release

### Requirement: Tauri private key managed via GitHub Secrets
The update signing private key SHALL be stored as a GitHub Actions secret and never committed to the repository.

#### Scenario: Secure key usage in CI
- **WHEN** the release workflow runs
- **THEN** the Tauri private key SHALL be read from `TAURI_PRIVATE_KEY` GitHub secret
- **THEN** the password SHALL be read from `TAURI_KEY_PASSWORD` GitHub secret
- **THEN** neither value SHALL appear in workflow logs
