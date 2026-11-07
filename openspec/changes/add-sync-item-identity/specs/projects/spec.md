# Spec Delta

## MODIFIED Requirements

### Requirement: Rename and delete cascade
Renaming or deleting a project or file SHALL carry or drop its archived flags and record tombstones in the same step, and a rename SHALL keep the item's stable id and update its recorded name and rename time, and renaming the active file or project SHALL keep the selection on the renamed item; deleting the active project or file SHALL clear the selection.

#### Scenario: Rename carries archived flags
- **WHEN** an archived project or file is renamed
- **THEN** the archived flag, and for a project every archived-file entry, moves to the new name

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Rename keeps identity
- **WHEN** a project or file is renamed
- **THEN** its stable id is unchanged, its recorded name and rename time are updated, and the tombstone for the old name is still recorded

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Delete drops archived flags
- **WHEN** an archived project or file is deleted
- **THEN** its archived entries are removed

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Colliding rename is a no-op
- **WHEN** a project or file is renamed into an existing name
- **THEN** nothing changes and no archived flag is moved to the other item

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Failed delete keeps archive flag
- **WHEN** a project delete fails to persist
- **THEN** the project stays archived

Covered by: src/features/projects/useProjects.test.tsx

## ADDED Requirements

### Requirement: Stable item identity
Every project and file SHALL have a stable id recorded in a locally stored identity sidecar with its current name and the time of its last rename; the sidecar SHALL follow create, rename and delete, SHALL assign ids to items it does not know yet, and SHALL drop entries for items that no longer exist.

#### Scenario: Ids assigned
- **WHEN** projects or files exist that the sidecar does not know, such as pre-existing data, imported files or newly created items
- **THEN** each receives a new unique id with its current name

Covered by: src/features/projects/identities.test.ts

#### Scenario: Rename keeps the id
- **WHEN** an item is renamed
- **THEN** its id is unchanged and its name and rename time are updated

Covered by: src/features/projects/identities.test.ts

#### Scenario: Delete drops the entry
- **WHEN** an item is deleted
- **THEN** its sidecar entry is removed

Covered by: src/features/projects/identities.test.ts

### Requirement: Rename convergence across devices
The system SHALL, before merging a pulled snapshot, align item names by id: an item known under the same id with different names SHALL take the name with the latest rename time on both sides (ties broken deterministically), so a rename made on one device merges as a rename and never as a second item.

#### Scenario: Rename on one device
- **WHEN** device A renames a project or file and syncs, then device B, which still has the old name, syncs
- **THEN** B ends with exactly one item under the new name, with the merged content

Covered by: src/features/projects/sync-roundtrip.test.tsx

#### Scenario: Concurrent renames
- **WHEN** both devices rename the same item to different names
- **THEN** both converge on the name with the later rename time and no copy remains under the other name

Covered by: src/features/projects/identities.test.ts

#### Scenario: Rename target name already used
- **WHEN** the winning name is already used by a different item on the other side
- **THEN** the renamed item takes that name with a numeric suffix so no content is overwritten

Covered by: src/features/projects/identities.test.ts

#### Scenario: Edit on the old name
- **WHEN** a device edits a file under its old name after another device renamed it
- **THEN** the sync yields one file under the new name containing the newer content

Covered by: src/features/projects/sync-roundtrip.test.tsx

### Requirement: Identity adoption from version 1 backups
The system SHALL match items of a snapshot without identities, or whose ids are unknown locally, to local items by name once and adopt a single id per item, preferring the lexicographically smaller id when both sides already have different ids for the same name.

#### Scenario: First sync with a version 1 backup
- **WHEN** the pulled backup has no identities
- **THEN** remote items take the ids of local items with the same name, and unmatched items get new ids

Covered by: src/features/projects/identities.test.ts

#### Scenario: Two devices created ids independently
- **WHEN** both sides hold different ids for the same project or file name
- **THEN** after the sync both sides hold the smaller id and no duplicate appears

Covered by: src/features/projects/identities.test.ts
