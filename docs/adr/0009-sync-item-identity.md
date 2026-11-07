# 9. Stable item identity for sync, as a sidecar

## Status

Accepted. Builds on [ADR-0004](./0004-sync-tombstones.md), whose
"stable id" option it adopts in a narrower form.

## Context

ADR-0004 kept identity name-based and fixed the resurrection of renamed
and deleted items with synced tombstones. A rename is still a key move, so
the old name survives on any device that has not seen the rename, and
only the name-keyed tombstone stops it. That fails whenever the tombstone
is missing or loses a comparison: it was pruned after 90 days, or the
old-name file was edited on another device after the rename. The visible
result is a duplicate: an item renamed on one device appears twice on a
device that already had it.

Local state (`projects[projectName][fileName]`) is read by 20+ files
(sidebar, drag and drop, import/export, archived sets, tombstones), so
re-keying it by id would be a large migration that also overlaps the later
work on synced archived state and ordering.

## Decision

Keep local state name-keyed and add an **identity sidecar**
(`src/features/projects/identities.ts`): per project and file, a stable
UUID mapped to its current name and the time of its last rename
(`nameUpdatedAt`). Files point at their project's id (files never move
between projects). The sidecar is stored locally, kept in step by
`useProjects` (create, rename, delete, import, merge), and synced in the
Drive backup, which becomes `version: 2` with an `identities` field.
Version 1 backups remain readable.

Before the existing name-keyed freshness merge, `alignRemote` makes the
pulled snapshot agree with the local names:

1. a remote item without an identity adopts the id of the local item with
   the same name;
2. two items with the same name but different ids (two devices that
   created ids independently) converge on the lexicographically smaller
   id;
3. an item known by the same id under two names takes the name with the
   later `nameUpdatedAt` on both sides (an exact tie goes to the larger
   name, so every device decides alike); if that name is taken by a
   different item, a numeric suffix keeps both.

`mergeProjectsByFreshness` is unchanged. Renames carry through to the
archived flags and the selection the same way a local rename does.

Rename tombstones stay as they are: a version 1 backup carries no ids, so
until the first version 2 sync the tombstone is the only thing that keeps
the old name from coming back.

## Consequences

- A rename merges as a rename: one item, the latest name, the newest
  content, including an edit made on the old name.
- No visible migration: ids are assigned lazily on load, import and merge.
- An older build that overwrites the backup drops `identities`; ids are
  re-adopted by name at the next sync. A rename made in that window can
  still produce one duplicate, as before this ADR.
- Clock skew can make an older rename win; the deterministic tie-break
  guarantees convergence, not chronological accuracy.
- Deletes are unchanged and still rely on name-keyed tombstones and their
  90-day expiry; removing that limitation and the rename tombstones is
  left to a follow-up.

## Reversal path

Older builds ignore the extra backup field and the sidecar key, so
reverting loses only the ids. The sidecar can be deleted at any time; it
is rebuilt from the names on the next load.
