## ADDED Requirements

### Requirement: Cat state animations
The UI SHALL display CSS/SVG animations for each cat state: Awake (趴着/走动), Sharpening (磨爪), Napping (睡觉), Unwell (蜷缩), Hatching (蛋壳裂开), Stretching (伸懒腰), Molting (换毛), Leaving (走向远方).

#### Scenario: Displaying awake cat
- **WHEN** an instance is in "running" state
- **THEN** the UI SHALL show a cat with gentle idle animation (tail wagging, ear twitching)

#### Scenario: Displaying napping cat
- **WHEN** an instance is idle for extended period
- **THEN** the UI SHALL show a sleeping cat with breathing animation and "zzz" particles

### Requirement: Cat hatching deployment animation
The deployment progress page SHALL display a multi-stage hatching animation: egg appears → cracks form → kitten emerges → stretches → awake.

#### Scenario: Viewing deployment progress
- **WHEN** a user watches the adoption (deployment) progress
- **THEN** the animation SHALL synchronize with the 9-step pipeline progress
- **THEN** each step completion SHALL advance the hatching animation

### Requirement: Warm color theme
The UI SHALL use a warm color palette: cream/ivory background, soft pink/mint/peach accent colors, distinct from NoDeskClaw's dark purple-blue tech aesthetic.

#### Scenario: Default theme appearance
- **WHEN** a user opens NekoClaw
- **THEN** the UI SHALL display with warm cream background and soft pastel accents

### Requirement: Cat-themed operation copy
All user-facing operation messages SHALL use cat-themed vocabulary.

#### Scenario: Delete confirmation dialog
- **WHEN** a user attempts to delete an instance
- **THEN** the dialog SHALL say "确定要让这只小猫离开吗？" instead of generic "确定删除？"

#### Scenario: Deployment in progress message
- **WHEN** a deployment is running
- **THEN** status messages SHALL use cat-themed text like "正在为小猫准备猫窝..."

### Requirement: Three.js nest 3D scene
The workspace view SHALL render a Three.js 3D scene with isometric perspective, showing a cat nest environment where cats roam based on their status.

#### Scenario: 3D nest rendering
- **WHEN** a user opens a workspace
- **THEN** the Three.js scene SHALL render hexagonal floor tiles with decorations (cat tower, food bowl, toys)
- **THEN** cat avatars SHALL be positioned at their hex coordinates with state-appropriate animations
