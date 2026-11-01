## Why

The drive-sync domain (Google Drive backup/sync of projects) has no OpenSpec baseline. This change records what the code does today so later changes can be written as deltas against it.

## What Changes

- Documents current behaviour only; no source, test or config changes.
- Covers the `SyncProvider` boundary, Client ID configuration, Google Identity token handling (memory-only token, silent reconnect and refresh), Drive `appDataFolder` upload/pull, the pull -> reconcile -> push sync flow, offline handling, and the config/sync UI panels.
- Defers to ADR 0004 (sync tombstones) and `docs/data-and-privacy.md` instead of restating them.
- Flags suspected gaps as `TODO:` requirements (provider accepts an empty Client ID, push can silently no-op yet sync reports success, pull has no offline guard, no in-app privacy disclosure despite the privacy doc).

## Capabilities

### New Capabilities

- `drive-sync`: connect to Google Drive with a user-supplied OAuth Client ID and keep the projects snapshot (plus tombstones) in sync via the app-private appDataFolder.

### Modified Capabilities

None.

## Impact

- Code in scope: `src/features/drive-sync/` and its tests.
- Documentation only; no runtime, API or dependency impact.
