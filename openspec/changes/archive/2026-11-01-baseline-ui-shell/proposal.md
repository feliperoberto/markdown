## Why

The app shell, shared components and small cross-cutting UI hooks have no written
specification. Behaviour lives in code comments, `docs/accessibility-notes.md` and
scattered tests. This baseline records what the code does today so later changes can
be expressed as deltas.

## What Changes

- Documentation only: no source, test or config changes.
- Describes the `ui-shell` domain as it behaves now: `src/app` (drawer, cloud button,
  Ctrl+S wiring, toolbar), `src/components` (Modal, Toast, Button, Checkbox,
  Breadcrumbs, BatchDownloadArea), `src/features/{theme,fullscreen,onboarding}`, and
  `src/lib` helpers (dropdown menu, outside click, save shortcut, drag gesture,
  clipboard, relative time, wait-for-event), plus scrollbar and a11y conventions.
- Gaps and suspected defects are recorded as `TODO:` requirements, not fixed.

## Capabilities

### New Capabilities
- `ui-shell`: application shell, shared UI primitives, theme/fullscreen/splash and UI helper hooks.

### Modified Capabilities
- None.

## Impact

- Adds files under `openspec/changes/baseline-ui-shell/` only.
- No runtime, dependency or API impact. See ADR-0001 and ADR-0007 for related decisions.
