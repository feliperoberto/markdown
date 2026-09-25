# 5. Projects blob in IndexedDB behind a synchronous write-behind mirror

## Status

Accepted. Supersedes the `MAX_BACKUPS = 50` change from #116.

## Context

Issue #120: users hit `QuotaExceededError` ("Setting the value exceeded the
quota") and could no longer save edits.

Everything lived in `localStorage`, which every major engine caps at about
5 MiB per origin. The `projects` key held the whole `ProjectsState` as one
JSON blob, and `backupProjects` wrote a full copy of it into a rotating
`projects_backup_{n}` slot before each destructive operation (delete, ZIP
import, Drive merge). #116 raised the cap from 5 to 50, so with a 100 KB
blob the backups alone could take about 5 MB. Once the quota was full,
the primary `projects` write itself failed. The backups were meant to
protect the document, and they ended up blocking it.

While reviewing the fix proposed in the issue, we found that several of
its premises did not hold:

- **Phase 1 was not done.** The referenced commit is not in the history,
  and `MAX_BACKUPS` was still 50.
- **Lowering the cap does not clean up on its own.** `rotateBackups` only
  visits indices `1..cap`, so after the cap drops, slots `cap+1..50` stay in
  storage forever.
- **A "structural changes only" backup filter would be wrong.** It would
  skip backups when only file content changed. But a ZIP import
  (`mergeProjects`) and a Drive merge (`mergeProjectsByFreshness`)
  overwrite the content of files that keep the same name. That content is
  exactly what the backup is for. Also, edits never created backups in
  the first place, so "100 edits = 100 backups" was never true.
- **The proposed `HybridStorageAdapter` does not work.** Its synchronous
  `get` returns a `Promise` from IndexedDB. It also sends writes to
  IndexedDB or localStorage by value size, so a read cannot know which
  backend holds a key.
- **The Drive provider needs no change.** It keeps only small flags in
  `localStorage` and never reads the projects blob from storage.
- **IE11 is irrelevant.** The app is an ES2022 module PWA.

## Decision

1. **Store the projects blob and its backups in IndexedDB.** The small UI
   sidecars (theme, archived/collapsed sets, tombstones, Drive flags) stay
   in `localStorage`. They are tiny, and old builds still read them
   synchronously (ADR-0003).
2. **Keep the synchronous `StorageAdapter` contract.** At boot,
   `initProjectsStorage` (`src/features/projects/storage-init.ts`) opens
   the database and reads the whole store into an in-memory mirror
   (`src/lib/mirrored-storage-adapter.ts`). Reads come from the mirror.
   Writes update the mirror at once and queue a write-behind to IndexedDB.
   Only the entry point (`main.tsx`) waits on async code; `storage.ts`,
   `useProjects`, and the tests keep their synchronous shape.
3. **Coalesce writes without debouncing.** The first write starts a
   transaction immediately. Writes that arrive while it is in flight
   merge, per key, into a single next transaction. So a burst of
   keystrokes costs at most two transactions, and the only data at risk
   on a crash is what one commit had not yet written.
4. **Migrate once, in one transaction.** The first boot on an
   IndexedDB-capable build copies `projects` plus the newest backups
   (compacted, capped at 10) in a single transaction. Only after that
   commit does it delete the `localStorage` copies, which is what frees
   the quota, and set a `projectsBackend=indexeddb` marker.
5. **Reconcile stale tabs.** Under ADR-0003, a pre-migration tab can keep
   running and saving to `localStorage`. If a `projects` blob shows up
   there after migration, it is merged into IndexedDB with
   `mergeProjectsByFreshness` and the stored tombstones, after a backup.
   The legacy copy is removed only once that write has committed.
6. **Fall back without losing data.**
   - IndexedDB never used and unavailable: stay on `localStorage` as
     before.
   - Marker set but IndexedDB will not open: run in memory only and warn
     the user. Seeding `localStorage` would show an empty state, and its
     writes would compete with the real data on the next successful boot.
   - Opening IndexedDB and the first read of its contents are each capped
     at 5 s, so a stall cannot keep the app from rendering.
   - The existing localStorage copy is read before IndexedDB is opened.
     A second tab migrating at the same moment writes to IndexedDB before
     it deletes from localStorage, so this tab always finds the data in
     one place or the other and never seeds a default over it.
7. **Harden backups on both backends.**
   - The cap depends on the backend: 3 on `localStorage`, 10 on IndexedDB.
     Rotation rewrites every slot, so each backup costs O(cap × blob).
   - Orphaned slots up to 50 are pruned at boot.
   - A backup identical to the newest one is skipped (exact comparison of
     the serialized blob).
   - Backups are written only when something will actually be overwritten:
     no-op deletes and Drive syncs that change nothing locally write none.
   - On a quota error, the oldest backups are evicted one at a time and the
     save is retried before the user is told it failed. On localStorage
     this happens inside `saveProjects`. On IndexedDB the error only
     arrives after the write was queued, so the write-error handler evicts
     and retries in the background.

## Consequences

- The quota ceiling becomes a share of free disk instead of about 5 MiB.
- **Weaker write guarantee.** On IndexedDB, a failed durable write can no
  longer stop the UI from showing the new state, because the synchronous
  `set` has already returned. Failures are reported through
  `onProjectsWriteError` as a throttled error toast and retried on the next
  mutation. On `localStorage`, `persist` still refuses to apply a change
  whose write threw, as before.
- A write still in flight when the tab closes can be lost. The window is
  a single IndexedDB commit.
- Two concurrent tabs still work last-writer-wins, as they did before.
  Each tab's backup rotation reads its own mirror, so concurrent
  destructive operations in two tabs can overwrite each other's backup
  slots. Backups remain best-effort.
- Backups still cannot be browsed or restored from the UI. That is a
  separate feature.
- `navigator.storage.persist()` is deliberately not called. Firefox
  prompts the user for it, and a permission prompt at boot is worse than
  the eviction risk, which is the same one `localStorage` already had.
