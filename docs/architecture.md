# Architecture

> Status: the migration is complete. The app that ships to
> `feliperoberto.com.br` is the Vite + Preact + TypeScript project described
> below — `prototype/index.html`, the original single-file, CDN-loaded
> monolith, is kept in the repo for reference only and is no longer
> deployed.

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

Styling, business logic migration, and PWA configuration have all since
landed — see the folder taxonomy below for where each lives, and
[ADR-0003](./adr/0003-user-prompted-service-worker-updates.md) for the PWA
update strategy specifically.

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
- `src/features/fullscreen/` — fullscreen toggle and its browser-API state.
- `src/features/onboarding/` — first-run help/tutorial UI.
- `src/features/pwa-install/` — Chromium `beforeinstallprompt` button plus
  the iOS "Add to Home Screen" instructional card.
- `src/features/pwa-update/` — notices a waiting service worker and shows
  the user-facing "Atualizar" prompt (ADR-0003).
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

Feature logic has since been fully extracted out of the legacy
`prototype/index.html` into these folders (Story #3 and later).
