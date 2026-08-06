# 3. User-prompted service-worker updates instead of silent auto-update

## Status

Accepted.

## Context

The PWA service worker (Story #4, issue #24) has shipped since v0.1.0 with
`vite-plugin-pwa`'s `registerType: 'autoUpdate'`. That setting makes the
plugin force Workbox's `skipWaiting: true` and `clientsClaim: true`, which
together mean: the moment a new build deploys, any tab with the app open
gets a new service worker that skips the waiting phase, purges the old
precache, and takes control of that tab immediately — while the tab is
still running the OLD JavaScript bundle, whose lazily-fetched assets may no
longer exist on the server under the same hashed names. Nothing reloads
the page, so the tab is left in an undefined state until the user
happens to refresh it on their own.

This app is a writing tool people leave open for long sessions across many
days, so that window is not theoretical. Two further facts about this
specific app make it worse than a generic PWA:

- `docs/data-and-privacy.md` documents that the Google Drive access token
  is held **in memory only, and is never persisted**. Any update-triggered
  reload — silent or not — disconnects Drive and requires the user to
  reconnect, with no warning beforehand.
- Nothing in `src/` imports `virtual:pwa-register`, so there was, until
  now, no code path that told the user an update had happened at all.
  Updates landed invisibly.

Options considered:

- **Keep `registerType: 'autoUpdate'`** (status quo). Rejected for the
  reasons above: a stale-asset hazard for long-lived tabs, and a silent,
  unannounced Drive disconnect.
- **`registerType: 'prompt'` with a periodic `setInterval` update poll.**
  Rejected: a timer firing in a background tab burns network and battery
  for a local-first, offline-capable editor with no server to justify
  polling. The moments a user could plausibly act on a prompt — opening
  the app, returning to a tab, regaining connectivity — already have
  matching browser events.
- **No explicit update handling at all**, relying on the browser
  activating a waiting worker only once every tab for the origin has
  closed. Rejected: an installed, standalone PWA can go months without
  every window closing, so users could sit on a stale build indefinitely
  with no way to know.
- **`registerType: 'prompt'` with on-load/on-focus/on-online re-checks and
  a user-initiated reload.** Chosen.
- **Extend the existing `Toast` component with an interactive, persistent
  variant**, instead of building a dedicated banner. Rejected: `Toast`
  (`src/components/Toast.tsx`) is non-interactive and auto-dismissing by
  contract (2s/4s/6s depending on variant, no action button, `pointer-
events: none` on its host) — its own design spec
  (`src/components/README.md`) states this explicitly. An update notice
  must persist until the user acts and must carry a button, so meeting
  that need would mean rewriting Toast's contract for every one of its
  existing ~15 call sites just to serve this one new caller. A dedicated,
  non-modal `UpdateBanner` (`src/features/pwa-update/`) keeps Toast's
  contract intact and has a direct precedent in this codebase: the PWA
  install experience (`src/features/pwa-install/`) built its own
  `IosInstallCard` on `Modal` rather than bending Toast to fit.

## Decision

Use `registerType: 'prompt'`, with the app explicitly checking for an
update — via `registration.update()` — when the tab loads, when it regains
focus, when the browser comes back online, and never on a timer. When the
check finds a new service worker waiting, a persistent, dismissible banner
(`src/features/pwa-update/UpdateBanner.tsx`) tells the user and offers an
"Atualizar" action. The reload — and the resulting Drive disconnect —
happens only when the user chooses it, never on its own.

`workbox.clientsClaim` stays `true` even though `skipWaiting` is now
`false`. `clientsClaim` only has an effect once a worker actually reaches
`activate`, which under `prompt` mode happens only after the user accepts
— so it cannot seize a tab out from under an editing session. What it
does affect is a **first-ever** install: with no existing controller to
steal from, claiming immediately means a brand-new visitor is
offline-ready after one page load instead of two. Turning it off would
have quietly regressed that first-visit behavior for no benefit to the
update story this ADR is actually about.

## Consequences

- Update latency changes from "next navigation, unannounced" to "the user
  sees a banner and decides" — deliberately less automatic, in exchange
  for never surprising someone mid-edit or mid-Drive-sync.
- A tab can now run an old build for as long as the user leaves the
  banner unanswered — in principle, indefinitely. That is the direct
  motivation for the storage-schema invariant recorded in
  `src/lib/storage-migrations.ts`: schema migrations must be purely
  additive, because an old tab reading data a newer tab already wrote can
  no longer be assumed to catch up within any bounded time.
- Dismissing the banner is per-page-load only, never persisted to
  `localStorage`. A persisted dismissal would need to be keyed to the
  specific version being offered, which the running page has no way to
  name — an unkeyed one would silently suppress every future prompt, not
  just this one.
- **One-time transition cost:** users already holding the previous
  `autoUpdate` service worker are not affected by this ADR retroactively
  — their existing worker still auto-reloads them, once, into whatever
  build first ships this change. Only from that point on does the prompt
  behavior actually govern their experience. This is expected and not a
  bug to chase.
- The version now shown in the Drive/Config modal
  (`src/features/drive-sync/DriveSyncPanel.tsx`, via
  `src/lib/app-version.ts`) exists specifically so a user or a bug report
  can state which build was running before an update was accepted or
  dismissed.

## Reversal path

If update latency ever proves too slow in practice (e.g. a critical fix
needs to reach every session fast), the fix is not to revert to
`autoUpdate` wholesale — it reintroduces both hazards this ADR exists to
avoid. Prefer tightening the re-check cadence first (a bounded background
interval, still skipped while hidden/offline) before reconsidering
`skipWaiting`/`clientsClaim` on updates specifically, and treat the Drive
in-memory-token constraint as a hard requirement on any such change, not
a detail to relitigate.
