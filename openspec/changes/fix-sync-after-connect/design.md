# Design

## Context

`connect()` in `useDriveSync.ts` awaits `provider.connect()`, which includes the account-picker popup, then calls `performSync`. Both functions close over the `reconcile` option of the render in which Connect was clicked. `app.tsx:76` passes `reconcile` as a new inline lambda on every render, and that lambda in turn captures `reconcileWithRemote`, which `useCallback` ties to `projects` and `tombstones` (`useProjects.ts:730`). So any edit made while the popup is open is missing from the merged result, and that merged result is pushed to Drive and written locally.

`push()` (`google-drive-provider.ts:499,521`) returns `undefined` when the token is missing. `performSync` treats that as success.

## Goals / Non-Goals

**Goals:**
- The connect-time sync always reconciles the latest state.
- A push that uploads nothing is reported as an error.

**Non-Goals:**
- Syncing after silent reconnect.
- Changes to the payload, identity, tombstones or archived state (later PRs in the stack).
- Background or automatic sync.

## Decisions

1. **Latest-callback ref.** `useDriveSync` stores `reconcile` in a `useRef`, updated on every render, and `performSync` calls `reconcileRef.current`. This is the standard "latest ref" pattern. Alternatives:
   - Requiring callers to pass a memoized callback is fragile and doesn't fix the stale state captured during the `await`.
   - Moving reconcile into the provider would break the injected-callback boundary.
2. **Push throws `DriveSyncNotConnectedError`.** This is a new typed error next to `DriveSyncOfflineError`, thrown in both "no token" branches. `performSync` already maps unknown errors to "Erro ao sincronizar: <message>", so no new UI copy is needed. A pt-BR message is used (in line with `docs/copy-guide.md`). The alternative, returning a boolean from push, would make every caller check it, and a missed check would bring back the silent success.
3. **Test first.** Write a failing test in `useDriveSync.test.ts` that changes `reconcile`'s output while the mocked `connect()` is pending and asserts on the payload passed to `push`. It confirms the root cause before the fix.

## Risks / Trade-offs

- [Other `push` callers expect a silent no-op] → `grep` shows `performSync` is the only caller; the tests cover it.
- [The ref read happens after the await, so a reconcile from an unmounted app shell could run] → The app shell never unmounts (see the existing comment at `useDriveSync.ts:120`). Acceptable.
- [If the user cancels the popup, connect rejects before sync] → Unchanged. The existing `catch` keeps that path silent.
