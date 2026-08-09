# 4. Synced tombstones for deleted/renamed/moved files and projects

## Status

Accepted.

## Context

`ProjectsState` has no stable file identity — a file is a key in
`Record<projectName, Record<fileName, ProjectFile>>`, and its name _is_ its
identity. A rename (`model.ts`'s `renameFile`/`renameProject`) is
therefore always a key move: insert under the new key, delete the old
one. `deleteFile`/`deleteProject` remove a key outright. (At the time
this ADR was written, moving a file to a different project — `moveFile`
with a `toProject` argument — was a fourth key-move case; that capability
was later removed as a product decision, unrelated to this ADR, so
`moveFile` no longer appears among the tombstone-recording sites below.)

`mergeProjectsByFreshness` (`model.ts`) reconciles a local `ProjectsState`
against a Google Drive snapshot by freshness, per file: newer `timestamp`
wins, and a file present on only one side is kept — that's deliberate,
since a file unique to one side is normally exactly the case the merge
exists to preserve (an edit made offline, a file created on another
device that hasn't synced back yet).

That "keep whatever's unique to one side" rule is also what breaks a
rename. Say `P/old.md` was already pushed to Drive. Locally, rename to
`P/new.md`: local now has `new.md` and not `old.md`; Drive still has
`old.md`. The next sync pulls a snapshot containing `old.md`, sees it as
remote-only (by the rule above, keep), and merges it back in — reviving
the name under its old key, with its old content, forever, since nothing
ever removes it from either side again. Delete has the identical shape:
a locally-deleted file is indistinguishable, to the merge, from a file
that simply hasn't synced _to_ Drive yet. Both look like "exists on only
one side" — the merge has no way to tell "the local device intentionally
removed this" from "the local device hasn't seen this remote addition
yet", because nothing records _intent_, only current state.

Options considered:

- **Give files a stable id, independent of name**, so rename becomes an
  in-place field update instead of a key move. Rejected for this change:
  it's a much larger migration (id assignment, backward compatibility
  with every existing snapshot and every `Record<name, ...>` call site
  across the codebase) for a problem that has a narrower fix. Worth
  revisiting if another feature independently needs stable ids.
- **Tombstones kept local-only, never synced.** Rejected: the bug is
  specifically that _another device's_ stale copy resurrects a rename or
  delete made _here_. A tombstone that never leaves the device that
  recorded it can't inform the merge running (implicitly) on the other
  device's next pull, so it doesn't fix the reported bug at all.
- **Synced tombstones, one composite-keyed map alongside `projects` in
  the snapshot.** Chosen.

## Decision

Add `src/features/projects/tombstones.ts`: a pure module over
`Tombstones = Readonly<Record<string, string>>`, mapping a composite key
to an ISO `deletedAt`. File keys reuse the existing
`encodeArchivedFileKey`/`decodeArchivedFileKey` pair already used for the
archived-files sidecar (one key format in the codebase, not two); project
keys use a new one-element sibling, `encodeProjectTombstoneKey`.

A tombstone is recorded at every site that removes or vacates a key —
`renameFile`/`renameProject` (old key), `deleteFile`/`deleteProject` —
gated on the same `saved` guard the codebase already uses to skip
persistence failures, and only when the operation is a real state change
(`next !== projects`), matching the existing archived-flag cascade
convention. Every site that re-creates a key (`createFile`, the
destination of a rename) clears any tombstone shadowing it.

`mergeProjectsByFreshness` takes a third argument, the combined
tombstone set. The fix is a single added rule in the existing remote-only
branch: a remote-only file (or project) is dropped, instead of kept,
when a tombstone for its key has `deletedAt` **newer than** that file's
own `timestamp`. The comparison — not a bare "tombstoned ⇒ always drop"
— is what preserves the case the original rule protected: if the file was
edited on another device _after_ the local delete, that edit is real new
information and must still win. A rename records its tombstone at
`new Date().toISOString()` at the moment of rename, which is always newer
than the untouched old file's `timestamp`, so the rename case resolves
correctly; an edit made anywhere before the deletion cannot un-delete it.

**Tombstones are synced, unlike the archived-files/archived-projects
sidecars.** Those two are deliberately device-local (a per-device UI
preference for what's hidden from the everyday list); a tombstone's
entire purpose is to tell _other_ devices something happened, so it must
cross devices to do its job. `ProjectsSnapshot` (`drive-sync/types.ts`)
gains an optional `tombstones` field; `google-drive-provider.ts`'s
`uploadSnapshot`/`pull` read and write it next to `projects`. The field
is optional and additive — an older client (or a snapshot from before
this change) simply omits it, which normalizes to `{}`, so no snapshot
version bump is needed. A pulled snapshot's tombstones go through
`normalizeTombstones` (same untrusted-input posture as
`normalizeProjectsState`): keys that don't decode to a known shape and
values that aren't parseable ISO timestamps are dropped rather than
poisoning the merge.

Two devices' tombstone sets are combined with `mergeTombstones` (latest
`deletedAt` per key wins, so neither device's deletion is ever silently
forgotten) before being used in a merge and before being pushed back,
mirroring `mergeProjectsByFreshness` itself being union-based.

Tombstones are pruned with a 90-day TTL (`pruneTombstones`, checked on
load and before push) so the map doesn't grow without bound — a
tombstone only needs to outlive the longest plausible gap between two
devices syncing, not the life of the app.

## Consequences

- Fixes the reported bug: renaming or deleting a file or project and then
  syncing no longer resurrects the old name on either device.
- The Drive snapshot's shape gains a field and the merge's conflict
  semantics gain a rule, but both are additive/backward compatible — an
  old client reading a snapshot with `tombstones` ignores the field it
  doesn't know about, and a snapshot without the field merges exactly as
  it did before this change (empty tombstone set, identical behavior).
- A device that stays offline for longer than the 90-day TTL and made a
  rename/delete just before going offline could, in principle, have that
  tombstone pruned before it ever syncs — the delete/rename would then
  behave as it did before this ADR (the old rule's known limitation,
  just bounded to an extreme case instead of every case). This is judged
  an acceptable edge case relative to letting the tombstone set grow
  forever; 90 days is far beyond normal sync cadence for this app.
- File/project identity is still name-based; this ADR does not introduce
  stable ids. A rename and a delete-then-recreate-under-the-same-name are
  still indistinguishable to the merge beyond what the tombstone/clear
  sites already handle explicitly.

## Reversal path

If the tombstone approach proves insufficient (e.g. a future feature
needs to track renames as edits to the same file rather than key moves),
the narrower fix here does not block moving to stable per-file ids later
— `tombstones.ts` and the merge's tombstone argument can be dropped once
identity no longer depends on the key itself.
