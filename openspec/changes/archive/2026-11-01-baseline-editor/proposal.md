## Why

The editor feature (`src/features/editor`) has no OpenSpec baseline. Its behaviour is only described in code comments and scattered tests, so future changes have nothing to diff against.

## What Changes

- Document the CURRENT behaviour of the editor domain as requirements with WHEN/THEN scenarios (brownfield; no code changes).
- Map each scenario to the Vitest or Playwright test that covers it, or mark it `none (untested)`.
- Record gaps and suspected defects as `TODO:` requirements instead of fixing them.

## Capabilities

### New Capabilities
- `editor`: edit/preview view toggle, markdown textarea, sanitized live preview, in-preview fragment links, character/token counters, copy-all button, and the "Aa" font-scale cycle.

### Modified Capabilities
- None.

## Impact

- Docs only: `openspec/changes/baseline-editor/`. No source, test or config changes.
- Related: ADR-0002 (pt-BR UI strings), `markdown-rendering` domain (`src/lib/markdown.ts`, `src/lib/fragment.ts`).
