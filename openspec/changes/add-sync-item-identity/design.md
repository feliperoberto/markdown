# Design

## Context

Local state is `projects[projectName][fileName]` and is read by 20+ files (sidebar, drag and drop, import/export, archived sets, tombstones). Merge (`mergeProjectsByFreshness`, `model.ts`) matches items by name. A rename is a key move, so the old key survives on any device that has not yet seen it, and only a name-keyed tombstone suppresses it (see proposal.md - Why, and ADR 0004).

Files cannot move between projects (see the `projects` spec), so a file's project never changes after creation.

## Goals / Non-Goals

**Goals:**
- A rename merges as a rename: one item, the latest name, the newest content.
- No migration step the user can notice: existing data and v1 backups keep working.
- A small blast radius: storage, merge and sync only.

**Non-Goals:**
- Re-keying app state, the UI or the ZIP format by id.
- Changing delete handling or the 90-day tombstone TTL (PR 3).
- Syncing archived state or ordering (PR 4).

## Decisions

1. **Identity sidecar, name-keyed state stays.** A map `identities` (one entry per project and per file):

   ```
   { projects: { [id]: { name, nameUpdatedAt } },
     files:    { [id]: { projectId, name, nameUpdatedAt } } }
   ```

   Stored locally under a new key and synced in the backup as `identities`. Alternatives: re-keying all state by id is the cleanest end state, but touches 20+ files and overlaps PR 4; embedding `id` in each `ProjectFile` cannot cover projects (they are plain objects keyed by name) and would leak into ZIP export.

2. **Pure module `identities.ts`** with `ensureIdentities`, `renameIdentity`, `pruneIdentities`, `alignRemote` and `mergeIdentities`. It has no UI or storage dependencies, so the logic is unit-tested directly, and `useProjects.ts` only wires it in.

3. **Alignment before the freshness merge.** In `reconcileWithRemote`:
   1. normalize remote identities (untrusted input; drop malformed entries);
   2. adopt ids by name (decision 4);
   3. for every id on both sides with different names, pick the winner by the later `nameUpdatedAt`; if equal, the lexicographically larger name wins (so both devices choose the same one);
   4. rename the loser's key in that side's projects, so both sides use the winning name;
   5. run the existing `mergeProjectsByFreshness` unchanged.

   This keeps the proven merge untouched, and a rename plus an edit on the old name merge into one file. Rejected alternative: teaching the merge about ids directly, which would rewrite the function that has the most test coverage.

4. **Adoption by name, smaller id wins.** A remote item with no identity (v1 backup) or an unknown id is matched to the local item with the same name and takes its id. If both sides already have different ids for one name (two devices upgraded independently), the lexicographically smaller id wins on both. Anything unmatched keeps or gets a fresh id.

5. **Name collisions on alignment.** If the winning name is already used by a different id on a side, the renamed item gets the suffix ` (2)`, ` (3)`, and so on, instead of overwriting. Content is never lost; the user can rename again.

6. **Renames record no tombstone.** `renameProject` and `renameFile` call `renameIdentity` instead. Deletes are unchanged. After upgrade, a rename on an old build still writes its old tombstones, which the existing merge still honors for the old-name key.

7. **Payload v2, v1 readable.** `uploadSnapshot` writes `version: 2` with `identities`. `pull` already ignores the version and reads fields defensively, so it just returns `identities` (undefined for v1). `ProjectsSnapshot` gains an optional `identities`, keeping the `drive-sync` feature free of `projects` types (the existing feature boundary).

8. **Ids are assigned lazily.** `ensureIdentities` runs on load and after create, import and merge, so existing data needs no one-off migration and ZIP imports get ids automatically. Ids are `crypto.randomUUID()`.

## Risks / Trade-offs

- [An older build overwrites the backup and drops `identities`] → Ids are re-adopted by name on the next v2 sync; a rename made in that window can still produce one duplicate, which is the status quo.
- [Two devices create ids independently, rename before their first sync] → They converge on the smaller id at the first sync; a rename made before that meeting is treated by name as today.
- [Sidecar drifts from state, for example after a failed write or manual edit of storage] → `ensureIdentities` and `pruneIdentities` run on every load and merge and repair it; a missing entry is just a new id.
- [Rename ties and clock skew] → A larger rename time wins even if the clock is wrong; the deterministic name tie-break guarantees convergence, not "correct" order.
- [Suffix on collision surprises the user] → Rare, never loses content, and is documented in the spec.

## Migration Plan

No data migration. Deploy ships the sidecar empty; the first load assigns ids, and the first v2 sync publishes them. Rollback: older builds ignore the extra field and the sidecar key, so reverting loses nothing but the ids.

## Open Questions

- Whether `identities` should also be cleared by "Desconectar": unaffected by this change, since it stays local.
