# Spec Delta

## MODIFIED Requirements

### Requirement: Backup payload format
The system SHALL upload a JSON document with `version: 2`, `exportedAt`, `projects`, `tombstones` and `identities` (each an empty object when absent), and SHALL record `lastDriveSync` only after a successful upload. Tombstone semantics are defined in ADR 0004 (`docs/adr/0004-sync-tombstones.md`).

#### Scenario: Tombstones uploaded
- **WHEN** the snapshot carries tombstones
- **THEN** they are uploaded next to `projects`

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Identities uploaded
- **WHEN** the snapshot carries identities
- **THEN** they are uploaded next to `projects` in a `version: 2` document

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Snapshot without identities
- **WHEN** the snapshot carries no identities
- **THEN** the document still has `version: 2` and `identities` is an empty object

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Last-sync bookkeeping
- **WHEN** an upload succeeds
- **THEN** `lastDriveSync` is stored

Covered by: src/features/drive-sync/google-drive-provider.test.ts

### Requirement: Pull
The system SHALL download the backup and return its `projects`, `tombstones` and `identities`, resolve `null` when no backup exists, and reject with "Formato de backup inválido" when the body is not valid JSON or lacks `projects`.

#### Scenario: No backup yet
- **WHEN** no backup file exists
- **THEN** pull resolves to null

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Well-formed backup
- **WHEN** the backup has projects, with or without tombstones
- **THEN** pull returns projects and tombstones, or `undefined` tombstones for an older backup

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Version 1 backup
- **WHEN** the backup was written by an older build and has no `identities`
- **THEN** pull returns its projects and tombstones with `undefined` identities, and does not reject

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Version 2 backup
- **WHEN** the backup has `identities`
- **THEN** pull returns them next to projects and tombstones

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Malformed backup
- **WHEN** the body is invalid JSON or lacks `projects`
- **THEN** pull rejects with "Formato de backup inválido"

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Not connected
- **WHEN** pull is called without a token
- **THEN** it rejects with "Not connected to Drive"

Covered by: none (untested)
