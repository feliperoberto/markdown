# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A notice when a new version of the app is available, with an "Atualizar"
  action, instead of the app updating itself silently in the background.
  The installed app version is now shown in the Google Drive/Config panel.
- Splash screen CTA linking to the companion book's PDF (`marcar-para-existir.pdf`).
- Per-file "last modified" timestamp shown in the sidebar file list.
- Archive/unarchive projects: an "Arquivar projeto"/"Desarquivar projeto"
  action in each project's "⋮" menu, and a "Mostrar arquivados" toggler at
  the bottom of the project list to reveal them again. Archived projects
  keep all their files (nothing is deleted) and stay included in ZIP export
  and Google Drive sync — only the sidebar's everyday list hides them. The
  archived state itself is local to the device and is not synced to Drive.
- Archive/unarchive individual files: an archive/unarchive action in each
  file's own "⋮" menu, and a per-project "Mostrar arquivados" toggler to
  reveal them again. Archived files keep their content (nothing is
  deleted) and stay included in ZIP export and Google Drive sync — only
  the sidebar's per-project file list hides them. Like archived projects,
  the archived state itself is local to the device and is not synced to
  Drive.

### Changed

- The app no longer updates itself in the background while you're writing —
  updates apply only when you choose them, so an update can never interrupt
  an editing session or drop your Google Drive connection unexpectedly
  ([ADR-0003](./docs/adr/0003-user-prompted-service-worker-updates.md)).
- Google Drive sync now reconciles local and remote data by per-file
  freshness (newest edit wins, files unique to either side are always kept)
  instead of blindly overwriting one side — this applies to both the manual
  sync button and the background auto-sync loop, and removes the risk of a
  sync accidentally destroying newer edits made on another device.
- The Drive panel's separate "Sincronizar Agora" and "Restaurar do Drive"
  buttons are now a single "Sincronizar" button that does a full,
  safe, bidirectional sync.
- A sidebar file's rename/archive/delete actions now open from a "⋮" menu
  on the row, the same interaction already used for project actions,
  instead of a swipe (touch) or hover (desktop) reveal. The swipe/hover
  reveal shipped with a bug — a row-level `:focus-within` meant simply
  opening a file could latch the actions permanently visible, and touch
  browsers' sticky emulated `:hover` did the same on phones/tablets — so
  it's replaced before release rather than patched, giving files and
  projects one consistent, deliberate way to reach their actions on every
  device.

## [0.1.0] - 2026-07-05

First versioned snapshot of the project. Prior to this release the project had
no version scheme, changelog, or tags — this entry summarizes the cumulative
state of the app as of the "production-grade" epic (#43), covering stories
#1 through #6.

### Added

- Vite + Preact + TypeScript project scaffold with a feature-sliced folder
  taxonomy (Story #1).
- Design tokens audit and a real, working theming system (Story #2), plus an
  accessibility remediation pass and accessible custom dialogs replacing
  native `prompt()`/`confirm()`.
- Feature extraction into independent, cohesive modules: Editor + Preview,
  Projects/Files, Google Drive Sync (behind a sync-provider interface), and
  Import/Export (Story #3).
- Shared component library used across editor, dialogs, and other UI
  surfaces (Story #3).
- Full PWA support: real `manifest.json` with a complete icon set, a service
  worker with an actual caching strategy, a subtle offline indicator, and a
  polished install experience (Chromium install prompt plus iOS install
  instructions) (Story #4).
- Architecture Decision Record documenting the Vite + Preact + TypeScript
  stack choice.

### Changed

- Replaced CDN-hosted dependencies (`marked`, `dompurify`, `jszip`) with
  pinned, bundled npm packages (Story #1).

### Fixed

- Sanitized project/file names to remove an `innerHTML` XSS sink in the
  batch-select UI (#27).
- Assorted code-review findings from the PWA work (#63-#66).

[Unreleased]: https://github.com/feliperoberto/markdown/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/feliperoberto/markdown/releases/tag/v0.1.0
