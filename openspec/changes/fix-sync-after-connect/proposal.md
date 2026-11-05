# Proposal

## Why

After an interactive "Conectar com Google", the user's data does not reach Drive, even though `connect()` already starts a pull-reconcile-push. The connect-time sync merges against the project state captured when Connect was clicked, so it can push stale data. A push that skips silently (because the token was cleared during refresh) still reports success. And because the connect-time sync hides its success toast, both failures are invisible.

This is PR 1 of a stacked series of sync fixes. It goes first because it is small and independent of the payload v2 work (identity, tombstones, archived/order) that follows.

## What Changes

- The connect-time sync SHALL reconcile against the latest local state, not the state from the render in which Connect was clicked.
- Push SHALL fail with a "not connected" error instead of returning silently when no token is available. The sync then reports an error, and neither shows success nor updates `lastSyncedAt`.
- Connect SHALL be considered complete only after its initial sync has uploaded data (or reported an error).
- Silent reconnect on load stays as it is: no sync.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `drive-sync`: the Sync flow requirement gains its connect-time guarantees. The TODO "push must not report success after silently skipping" becomes a real requirement.

## Impact

- `src/features/drive-sync/useDriveSync.ts`: use the latest `reconcile` through a ref.
- `src/features/drive-sync/google-drive-provider.ts`: `push()` throws when no token is available.
- Tests: `useDriveSync.test.ts`, `google-drive-provider.test.ts`.
- No payload, storage or UI-copy changes beyond reusing the existing error toast.
