# Tasks

## 1. Identity sidecar (pure module)

- [ ] 1.1 Add `src/features/projects/identities.test.ts` with failing tests for `ensureIdentities` (assigns unique ids to unknown projects and files), `renameIdentity` (keeps the id, updates name and rename time) and `pruneIdentities` (drops entries for missing items). Verify with `npx vitest run src/features/projects/identities.test.ts` that they fail before the implementation.
- [ ] 1.2 Implement `src/features/projects/identities.ts` (types, `ensureIdentities`, `renameIdentity`, `pruneIdentities`, `normalizeIdentities` for untrusted input, same-reference-on-no-op like the other sidecars). Verify the tests from 1.1 pass.
- [ ] 1.3 Add local persistence (`loadIdentities` / `saveIdentities`) to `storage.ts` under a new key, with a test in `storage.test.ts` for round trip and for malformed stored data. Verify with `npx vitest run src/features/projects/storage.test.ts`.

## 2. Alignment and adoption (pure)

- [ ] 2.1 Add failing tests in `identities.test.ts` for adoption by name (v1 remote takes local ids; unmatched get new ids; different ids for one name converge on the smaller), and for `alignRemote`: rename on one side, concurrent renames (later time wins, equal time uses the name tie-break), a name collision (suffix ` (2)`), and a file whose project was renamed. Verify they fail.
- [ ] 2.2 Implement adoption, `mergeIdentities` and `alignRemote` so both sides' projects use the winning names before `mergeProjectsByFreshness`. Verify the tests from 2.1 pass.

## 3. Wire into the projects hook

- [ ] 3.1 Add failing tests in `useProjects.test.tsx`: renaming a project or file keeps its id, writes no tombstone, and still carries the archived flags; deleting drops the sidecar entry; created and imported items receive ids. Verify they fail.
- [ ] 3.2 In `useProjects.ts`, keep identities in state and storage, call `ensureIdentities` on load and after create, import and merge, replace the rename tombstones with `renameIdentity`, and prune on delete. Verify the tests from 3.1 and the existing rename tests pass.
- [ ] 3.3 Extend `reconcileWithRemote` to align the remote with `alignRemote` before the freshness merge, and return the merged identities with the projects and tombstones. Add a round trip test in `sync-roundtrip.test.tsx` for: rename on A then sync on B (one item); a rename on A with an edit under the old name on B (one item, new name, newer content); a v1 remote; independent ids. Verify with `npx vitest run src/features/projects`.

## 4. Payload v2

- [ ] 4.1 Add failing tests in `google-drive-provider.test.ts`: upload writes `version: 2` with `identities` (and an empty object when absent); pull returns `identities` for a v2 backup and `undefined` for a v1 backup. Verify they fail.
- [ ] 4.2 Add optional `identities` to `ProjectsSnapshot` (`types.ts`), write it in `uploadSnapshot`, return it from `pull`, and pass it through the reconcile callback in `src/app/app.tsx`. Verify the tests from 4.1 pass and `npm run typecheck` is clean.

## 5. Docs and integration

- [ ] 5.1 Add `docs/adr/0009-sync-item-identity.md` recording decisions 1, 3, 4 and 6, and a short note in ADR 0004 that renames no longer use tombstones. Verify the ADR links resolve (`docs/adr/` index, if any, lists it).
- [ ] 5.2 Update the "Covered by" lines in the delta specs, then run `python3 .claude/scripts/openspec_drift_check.py --validate` and `openspec validate add-sync-item-identity --strict`. Verify both pass.
- [ ] 5.3 Run `npm run lint && npm run typecheck && npm test && npm run format:check` and verify they pass; run the e2e suite with the pre-installed Chromium, and verify no new failures against the base branch.

## Workflow follow-up

- Commit to `ccr-a1dbf84e-6rba6j-identity`; its PR targets the PR 1 branch `ccr-a1dbf84e-6rba6j`.
- After PR 1 merges, retarget this PR to `main` and rebase.
- Archive the change with `/opsx:archive` after merge.
