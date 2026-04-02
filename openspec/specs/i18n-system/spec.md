## ADDED Requirements

### Requirement: Frontend i18n with vue-i18n
The frontend SHALL use vue-i18n with nested key structure, supporting zh-CN and en-US locales. Locale detection SHALL check localStorage first, then browser language.

#### Scenario: Detecting initial locale
- **WHEN** a user visits NekoClaw for the first time
- **THEN** the system SHALL detect browser language and set the appropriate locale
- **THEN** the locale preference SHALL be saved to localStorage

#### Scenario: Switching locale
- **WHEN** a user changes language in settings
- **THEN** all UI text SHALL update immediately without page reload

### Requirement: Backend i18n error responses
The backend SHALL return error responses with `code`, `error_code`, `message_key`, and `message` fields. The frontend SHALL prioritize local translation of `message_key`, falling back to `message` if no translation exists.

#### Scenario: Backend returns localized error
- **WHEN** a backend error occurs
- **THEN** the response SHALL include message_key (e.g., "errors.neko.not_found")
- **THEN** the frontend SHALL look up the local translation for that key

### Requirement: Cat-themed i18n vocabulary
All i18n translations SHALL use cat-themed vocabulary for system concepts (猫窝/Nest, 猫咪/Neko, 猫技/Trick, 领养/Adopt, etc.).

#### Scenario: Chinese locale cat terminology
- **WHEN** locale is zh-CN
- **THEN** workspace SHALL be displayed as "猫窝", deploy SHALL be "领养", gene SHALL be "猫技"

#### Scenario: English locale cat terminology
- **WHEN** locale is en-US
- **THEN** workspace SHALL be displayed as "Nest", deploy SHALL be "Adopt", gene SHALL be "Trick"

### Requirement: No hardcoded UI strings
All user-visible text SHALL go through i18n. No new hardcoded Chinese or English strings SHALL be added to templates.

#### Scenario: Adding new UI text
- **WHEN** a developer adds a new user-visible string
- **THEN** it SHALL be added as an i18n key in both zh-CN.ts and en-US.ts locale files
