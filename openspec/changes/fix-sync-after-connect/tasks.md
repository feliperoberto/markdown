# Tasks

## 1. Reproduce

- [ ] 1.1 Add a failing test in `src/features/drive-sync/useDriveSync.test.ts`: rerender with a new `reconcile` while `connect()` is pending, then assert that the payload `push` receives comes from the new callback. Verify with `npx vitest run src/features/drive-sync/useDriveSync.test.ts`, where the test must fail.
- [ ] 1.2 Add a failing test in `src/features/drive-sync/google-drive-provider.test.ts`: `push()` rejects when no token is available, and when the silent refresh clears the token. Verify that it fails.

## 2. Fix

- [ ] 2.1 Store `reconcile` in a latest-value ref inside `useDriveSync` and use it in `performSync`. Verify that test 1.1 passes.
- [ ] 2.2 Add `DriveSyncNotConnectedError` (with a pt-BR message), throw it in both no-token branches of `push()`, and export it next to `DriveSyncOfflineError`. Verify that test 1.2 passes.
- [ ] 2.3 Add a `useDriveSync` test: when push throws `DriveSyncNotConnectedError`, an error toast is shown and `lastSyncedAt` is unchanged. Verify that it passes.
- [ ] 2.4 Update the "Covered by" lines in the delta spec for the new scenarios. Verify with `python3 .claude/scripts/openspec_drift_check.py --validate`.

## 3. Integration

- [ ] 3.1 Run `npm run lint && npm run typecheck && npm test && npm run format:check`, and verify they all pass.
- [ ] 3.2 Run `npm run test:e2e`, and verify the existing Drive and sync flows still pass.

## Workflow follow-up

- Commit to `ccr-a1dbf84e-6rba6j`. This is the base of the stack and targets `main`.
- After merge, archive the change with `/opsx:archive`, and rebase PR 2 (identity) onto `main`.
