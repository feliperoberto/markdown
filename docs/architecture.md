# Architecture

> Status: migration in progress. The app currently ships as a single static
> `index.html` prototype (with CDN-loaded `marked`, `DOMPurify`, `JSZip`, and
> the Google OAuth/Drive JS client). It is being migrated to a Vite + Preact +
> TypeScript project, one task at a time. The prototype `index.html` remains
> live on GitHub Pages until the migration replaces it.

## Stack decision

See [`docs/adr/0001-frontend-stack.md`](./adr/0001-frontend-stack.md) for the
full rationale (Preact vs React, Vite vs Next.js, alternatives considered) —
that ADR is the single source of truth for this decision.

## Current scaffold

- `app.html` is the Vite entry point (kept separate from the legacy root
  `index.html`, which is left untouched for GitHub Pages).
- `src/` holds the Preact source, with path aliases `@/features`,
  `@/components`, `@/lib` mapped to `src/features`, `src/components`,
  `src/lib` respectively.
- `vite.config.ts` sets `base: '/'`, matching the custom domain configured in
  `CNAME` (`feliperoberto.com.br`), since the site is not served from a
  GitHub Pages repo subpath.

Later tasks own: styling, business logic migration, and PWA configuration.

## Folder taxonomy

Each folder owns a single concern. A newcomer should be able to point at any
folder below and know what belongs there without reading code first.

- `src/app/` — the root component and app shell (layout, providers, routing
  if any is ever introduced). No feature-specific logic lives here.
- `src/features/editor/` — the markdown editor: text input, live preview,
  and their local state.
- `src/features/projects/` — project/file list management (create, rename,
  delete, switch between projects and files).
- `src/features/import-export/` — importing/exporting projects and files
  (e.g. zip download/upload) at the UI/feature level.
- `src/features/drive-sync/` — Google Drive authentication and sync UI/state.
- `src/features/theme/` — light/dark theme toggle and preference state.
- `src/features/onboarding/` — first-run help/tutorial UI.
- `src/components/` — shared, framework-level "dumb" UI components with no
  feature-specific business logic (buttons, modals, layout primitives).
- `src/lib/` — framework-agnostic logic usable outside Preact: the
  localStorage/storage adapter, the markdown render + sanitize pipeline, and
  zip (JSZip) utilities.
- `src/styles/` — design tokens and global CSS.
- `public/` — static assets served as-is (icons, manifest).

### Import rule

Feature folders may import from `components/` and `lib/`, but never from
each other directly. If `drive-sync` needs data from `projects`, or
`import-export` needs to trigger a save from `editor`, that communication
goes through an explicit exported interface (e.g. a function/hook exported
from the feature's own index, wired together in `src/app/`), not a direct
import of one feature's internals from another. This keeps each feature
independently understandable and replaceable.

This task defines and documents the shape only; no logic has been moved out
of the legacy `index.html` yet. Extracting feature logic into these folders
is the scope of the later Feature Modularization tasks (Story #3).
