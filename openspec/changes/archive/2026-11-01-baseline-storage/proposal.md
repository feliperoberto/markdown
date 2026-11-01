## Why

The storage layer (synchronous adapter contract, IndexedDB key/value store, write-behind mirror, and schema migrations) has no OpenSpec coverage. This change records what the code does today so later changes can be written as deltas.

## What Changes

- Documents current behaviour only; no source, test or config changes.
- Covers `src/lib/storage-adapter.ts`, `idb-kv.ts`, `mirrored-storage-adapter.ts` and `storage-migrations.ts`, read against ADR 0005 (IndexedDB projects storage) and ADR 0003/0004 references, and `docs/data-and-privacy.md`.
- Suspected gaps and stale comments are recorded as `TODO:` requirements with file:line evidence.

## Capabilities

### New Capabilities
- `storage`: key/value adapter contract, IndexedDB store, write-behind mirror, projects schema envelope and migrations.

### Modified Capabilities
- None.

## Impact

- Documentation only: adds `openspec/changes/baseline-storage/`.
- Boot orchestration (`src/features/projects/storage-init.ts`) and backup rotation (`storage.ts`) belong to the projects domain and are only referenced.
