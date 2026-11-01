## Why

The projects domain (`src/features/projects`) owns the project/file tree, its persistence, the archive and reorder features, and the freshness/tombstone merge used by Drive sync. It has no OpenSpec coverage yet. This brownfield baseline records what the code does today so later changes can be expressed as deltas.

## What Changes

- Documents current behaviour only; no source, test or config changes.
- Adds one capability spec with requirements and scenarios mapped to existing unit, component and e2e tests.
- Records suspected gaps and defects as `TODO:` requirements for later triage.

## Capabilities

### New Capabilities
- `projects`: project/file CRUD, selection memory, archive, reorder (pointer drag and menu), storage backends and backups, merge/tombstone sync semantics, input normalization.

### Modified Capabilities
- None.

## Impact

- Code read: `src/features/projects/*`, plus e2e specs `archive-files`, `archive-projects`, `file-row-actions`, `sidebar-reorder*`, `config-modal-overlap`.
- Related decisions: ADR-0003, ADR-0004, ADR-0005.
