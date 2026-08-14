# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Reordering files and projects in the sidebar: drag a file's or project's
  handle to a new position, or use the "⬆ Mover para cima"/"⬇ Mover para
  baixo" items in its "⋮" menu.

### Changed

- Sidebar drag & drop is rewritten on Pointer Events instead of HTML5
  Drag-and-Drop, so reordering files and projects now works on touch
  devices, not just with a mouse. A small `⠿` grip on each row/header is
  the drag affordance; the rest of the row still taps to open/expand and
  scrolls normally. Every "⋮" menu also gained "Mover" items as a
  non-drag, keyboard-accessible equivalent (WCAG 2.1 SC 2.5.7/2.1.1).
- A file's "⋮" actions menu trigger is now hidden unless that file is the
  active one (or its menu is open), revealing on hover only on
  pointer-capable/hover-capable devices — cutting down on visual noise
  from a permanently-visible "⋮" on every row.
- Shortened the file "⋮" menu's item labels ("Renomear", "Arquivar"/
  "Desarquivar", "Excluir") by dropping the redundant word "arquivo" —
  the menu itself is already announced as "Ações do arquivo <nome>".
- The "Mover para cima"/"Mover para baixo" items (file and project menus)
  are no longer part of the visual menu by default, now that reordering
  is primarily done via the drag handle — they stay in the DOM and in the
  accessibility tree, revealing themselves only once keyboard/AT focus
  reaches them, so the WCAG 2.1 SC 2.5.7/2.1.1 keyboard path from the
  entry above is unchanged for keyboard and screen-reader users.
- A project's "⋮" menu now has a single "Upload" item that accepts one or
  more files, replacing the previous "Upload" (single file) / "Importar
  vários arquivos" pair — the file picker itself already lets you choose
  how many files to select, so the two buttons offered the same choice
  twice.

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
  instead of blindly overwriting one side, removing the risk of a sync
  accidentally destroying newer edits made on another device.
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

### Fixed

- Creating a new file now selects it immediately, so the editor shows the
  new file instead of leaving whatever was open before. A collapsed
  project auto-expands and the mobile drawer closes so the newly active
  file is actually visible — uploading one or more files does the same,
  selecting the last file created.
- Renaming a file (or renaming or deleting a project), followed by a
  Google Drive sync, no longer resurrects the old name(s) as duplicates.
  The sync merge previously had no way to tell "deleted on this device"
  apart from "never seen this device's edit yet", so a stale remote copy
  under the old name kept winning the union and syncing back; deleting or
  renaming a whole project now also protects every file that was inside
  it, and reusing a project name no longer resurrects the old project's
  files ([ADR-0004](./docs/adr/0004-sync-tombstones.md)).
- Uploading several files into a project at once no longer silently drops
  every file but the last one — the import loop previously read a stale
  snapshot of the project list on every file, so only the final file
  actually got saved despite the toast reporting all of them as imported.
- A non-active file's "⋮" actions menu is now reachable by Tab, not just
  by mouse hover or by opening the file first — the CSS that hides the
  trigger by default previously also removed it from the keyboard tab
  order entirely.
- Fixed a couple of drag-and-drop auto-scroll inefficiencies: the
  auto-scroll loop no longer re-arms on every pointer movement regardless
  of how far the pointer is from an edge, and no longer re-measures drop
  zones twice for the same scroll change.
- Fixed the sidebar re-rendering every file row on every keystroke —
  editing a file's content was incidentally invalidating the project name
  list used to compute each row's move-up/move-down menu items, even
  though the actual list of projects hadn't changed.

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
