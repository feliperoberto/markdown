# Proposal

## Why

Projects and files are identified only by their names, so a rename is indistinguishable from "delete the old item and create a new one". Today the only thing that stops the old name from coming back after a sync is a name-keyed tombstone, which fails whenever it is missing or loses a timestamp comparison: pruned after 90 days, or the old-name file edited on another device after the rename. The result is the reported duplicate: an item renamed on one device appears twice on a device that already had it. Stable identities fix this at the root, because a rename becomes a change of attribute on the same item.

This is PR 2 of the stacked sync fixes, on top of `fix-sync-after-connect`.

## What Changes

- Every project and file gets a stable id (UUID). Ids live in a new **identity sidecar** that records, per id, the current name and when it was last renamed (`nameUpdatedAt`). Local project state and the UI stay name-keyed.
- The sidecar is stored locally and synced in the Drive backup, which moves to `version: 2` with a new `identities` field. Pull keeps accepting `version: 1` backups.
- Before the freshness merge, the remote snapshot is aligned to the local names using the sidecars: an item known by the same id under two names takes the name with the latest `nameUpdatedAt` on both sides, so the merge sees one item.
- Items without a counterpart id (first sync with a v1 backup, or two devices that created ids independently) are matched by name once. Both sides then converge on a single id.
- Renaming a project or file also updates its identity (same id, new name and rename time). It keeps recording the existing tombstone for the old name as a bridge: a v1 backup carries no ids, so until the first v2 sync the tombstone is the only thing that stops the old name from coming back. Tombstones themselves are unchanged until PR 3.

Out of scope: tombstones keyed by id and delete-always-wins (PR 3); synced archived state and ordering (PR 4); re-keying the app state by id.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `drive-sync`: the backup payload becomes version 2 with `identities`, and pull returns identities (absent for a v1 backup).
- `projects`: adds the stable-identity and rename-convergence requirements, and the identity update on rename.

## Impact

- `src/features/projects/`: new `identities.ts` (pure functions and tests), `storage.ts` (new local key), `model.ts` (rename alignment before `mergeProjectsByFreshness`), `useProjects.ts` (maintain identities on create, rename and delete; use them in `reconcileWithRemote`).
- `src/features/drive-sync/`: `types.ts` (optional `identities` on the snapshot), `google-drive-provider.ts` (v2 upload, pull).
- `src/app/app.tsx`: pass identities through the reconcile callback.
- `docs/adr/0004-sync-tombstones.md`: add a note that rename no longer uses tombstones; a new ADR records the id-sidecar decision.
- Older app versions that read a v2 backup ignore `identities`; an older device that overwrites the backup drops them, and ids are re-adopted by name on the next sync.
