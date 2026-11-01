## Why

The print/PDF export feature (`src/features/print-export`) has no OpenSpec coverage. This baseline records what the code does today, so later changes can be written as deltas. It describes current behaviour only; it does not change it.

## What Changes

- Adds a baseline spec for the print-export domain: toolbar button, print root lifecycle, print-time hooks (`beforeprint`/`afterprint`), asset waiting, title swap, running head and page furniture flags, print-time document adaptation (open `<details>`, link disclosure, in-document links), print media layout and the ink-saving dark-theme print.
- Maps each scenario to the unit and e2e tests that exercise it, or marks it untested.
- Records two suspected gaps as `TODO:` requirements (print failure cleanup, overlapping print requests).

## Capabilities

### New Capabilities
- `print-export`: browser-native "Exportar PDF" via a dedicated print root and `window.print()` (ADR-0006, ADR-0007, ADR-0008).

### Modified Capabilities
- None.

## Impact

- Documentation only: `openspec/changes/baseline-print-export/`. No source, test or config changes.
- Source in scope: `src/features/print-export/*`; print CSS in `src/styles/document.css` and `src/styles/global.css` is described only through its e2e tests.
