# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Splash screen CTA linking to the companion book's PDF (`marcar-para-existir.pdf`).
- Per-file "last modified" timestamp shown in the sidebar file list.

### Changed

- Google Drive sync now reconciles local and remote data by per-file
  freshness (newest edit wins, files unique to either side are always kept)
  instead of blindly overwriting one side — this applies to both the manual
  sync button and the background auto-sync loop, and removes the risk of a
  sync accidentally destroying newer edits made on another device.
- The Drive panel's separate "Sincronizar Agora" and "Restaurar do Drive"
  buttons are now a single "Sincronizar" button that does a full,
  safe, bidirectional sync.

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
