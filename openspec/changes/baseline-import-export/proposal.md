## Why

The import-export feature (`src/features/import-export`) has no OpenSpec baseline. Its behaviour is only described by code comments and tests, so future changes cannot be checked against a written contract.

## What Changes

- Documents the CURRENT behaviour only; no source change.
- Records single-file import, ZIP import (sanitization, collisions), and single-file, project and batch export.
- Records gaps as `TODO:` requirements: an unused toolbar duplicating app-shell logic, non-.md ZIP entries imported, and export names not sanitized.

## Capabilities

### New Capabilities
- `import-export`: markdown file/ZIP import and file/project/batch export.

## Impact

- Code: `src/features/import-export/*`, `src/lib/sanitize.ts`, call sites in `src/app/app.tsx`, `src/components/BatchDownloadArea.tsx`.
- Tests: vitest unit tests in the feature; e2e `import-export-golden-path`, `batch-download-overflow`.
- Related: ADR-0005 (storage of imported projects).
