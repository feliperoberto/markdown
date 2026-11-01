# drive-sync Specification

## Purpose
Optional Google Drive connection and synchronization of projects, including tombstones for deletions.

## Requirements

### Requirement: Client ID storage
The system SHALL persist the user-supplied OAuth Client ID in localStorage under the key `driveClientId`, and SHALL never persist the placeholder value.

#### Scenario: Nothing stored
- **WHEN** no Client ID has been saved
- **THEN** `getStoredClientId` returns an empty string, never the placeholder

Covered by: src/features/drive-sync/config.test.ts

#### Scenario: Save and clear
- **WHEN** a real Client ID is saved and later cleared
- **THEN** it is returned while stored and an empty string after clearing

Covered by: src/features/drive-sync/config.test.ts

#### Scenario: Placeholder refused
- **WHEN** `setStoredClientId` is called with a value starting with `SEU_CLIENT_ID`
- **THEN** nothing is persisted

Covered by: src/features/drive-sync/config.test.ts

### Requirement: Configured check
The system SHALL treat a Client ID as configured only when it is non-blank after trimming and is not the placeholder.

#### Scenario: Configured values
- **WHEN** the value is empty, the placeholder, or a real-looking ID
- **THEN** `isClientIdConfigured` returns false, false and true respectively

Covered by: src/features/drive-sync/config.test.ts

### Requirement: Client ID form handling
The system SHALL trim a submitted Client ID, reject a blank one with a warning toast, and update the `configured` state immediately on save or clear.

#### Scenario: Blank Client ID rejected
- **WHEN** `saveClientId` receives an empty or whitespace-only value
- **THEN** nothing is persisted, a warning toast is shown and it returns false

Covered by: src/features/drive-sync/useDriveSync.test.ts

#### Scenario: Valid Client ID saved
- **WHEN** `saveClientId` receives a real value
- **THEN** the trimmed value is persisted, `configured` becomes true at once, a success toast is shown and it returns true

Covered by: src/features/drive-sync/useDriveSync.test.ts

#### Scenario: Client ID cleared
- **WHEN** `clearClientId` is called
- **THEN** the stored value is removed and `configured` becomes false

Covered by: src/features/drive-sync/useDriveSync.test.ts

#### Scenario: Config panel form
- **WHEN** the user submits the form, or clicks the clear button
- **THEN** the panel calls `saveClientId` with the typed value, or calls `clearClientId` and empties the input

Covered by: src/features/drive-sync/DriveConfigPanel.test.tsx

### Requirement: Memory-only access token
The system SHALL keep the Drive access token only in memory and MUST NOT write it to localStorage, sessionStorage or any other persistent store. See `docs/data-and-privacy.md`.

#### Scenario: Status reflects the in-memory token
- **WHEN** the provider has no token
- **THEN** `getStatus().connected` is false, and `lastSyncedAt` comes from the `lastDriveSync` key

Covered by: none (untested)

### Requirement: Interactive connect
The system SHALL request a token through Google Identity Services with the `drive.appdata` scope on an explicit connect, showing the account picker (no `prompt: ''`), then resolve the user name and report status `connected` with a success toast.

#### Scenario: Interactive token request
- **WHEN** the user clicks connect
- **THEN** the token client is created without a silent prompt

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Placeholder Client ID
- **WHEN** `connect()` runs with the placeholder stored
- **THEN** an error toast is emitted and the call rejects

Covered by: none (untested)

#### Scenario: User cancels the popup
- **WHEN** GIS reports `popup_closed`
- **THEN** no error is logged or toasted and the call rejects

Covered by: none (untested)

#### Scenario: Other auth errors
- **WHEN** GIS reports any other error during an explicit connect
- **THEN** an error toast "Erro ao conectar: <error>" is emitted and the call rejects

Covered by: none (untested)

#### Scenario: Connect while offline
- **WHEN** the user connects while the browser is offline
- **THEN** a warning toast is shown and no connection is attempted

Covered by: none (untested)

### Requirement: Silent reconnect on load
The system SHALL attempt a silent token request (`prompt: ''`) on load only if the `driveAutoReconnect` hint is set, a real Client ID is configured and the browser is online, SHALL abandon it after 15 seconds, and MUST NOT show an error toast or run a sync.

#### Scenario: Silent request made
- **WHEN** the hint is set and `reconnectSilently()` runs
- **THEN** a silent token is requested

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: No hint
- **WHEN** the hint is not set
- **THEN** no GIS request is made and it resolves to false

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: GIS error or no callback
- **WHEN** GIS reports an error, or never calls back
- **THEN** it resolves to false without throwing

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: One attempt per page load
- **WHEN** the app starts offline and later goes online
- **THEN** the hook makes its single attempt the first time it is online, and never retries

Covered by: none (untested)

### Requirement: Auto-reconnect hint lifecycle
The system SHALL set the non-secret `driveAutoReconnect` flag after a successful connection and remove it on disconnect.

#### Scenario: Flag written and removed
- **WHEN** connect succeeds, then disconnect runs
- **THEN** the flag is set after connect and removed after disconnect

Covered by: src/features/drive-sync/google-drive-provider.test.ts

### Requirement: Supersession of in-flight connections
The system SHALL discard a token response, and skip finishing the connection, if `disconnect()` or a newer connect ran while the request was in flight.

#### Scenario: Disconnect during connect
- **WHEN** the user disconnects while a token request or user lookup is pending
- **THEN** the stale result is ignored and the connection is not revived

Covered by: none (untested)

### Requirement: Proactive silent token refresh
The system SHALL, before each push or pull, silently refresh a token within 5 minutes of its `expires_in` expiry, bounded by 15 seconds; on a genuine GIS failure it SHALL clear the token and report status `offline`, and on a mere timeout it SHALL keep the token.

#### Scenario: Refresh fails
- **WHEN** the silent refresh reports an error
- **THEN** the token is cleared and status becomes `offline`

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Refresh times out
- **WHEN** the silent refresh never answers
- **THEN** the token is kept and status is not changed to `offline`

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Refresh succeeds
- **WHEN** the token is near expiry and GIS returns a new one
- **THEN** the new token and expiry replace the old ones

Covered by: none (untested)

### Requirement: Disconnect
The system SHALL revoke the token with Google, clear all in-memory connection state, remove the auto-reconnect hint, report status `offline` and toast "Desconectado do Drive", while leaving local projects untouched.

#### Scenario: Disconnect clears state
- **WHEN** the user disconnects
- **THEN** the hook reports not connected and no user name

Covered by: src/features/drive-sync/useDriveSync.test.ts

#### Scenario: Revocation call
- **WHEN** a token exists at disconnect
- **THEN** the token is passed to GIS `revoke`

Covered by: none (untested)

### Requirement: Drive storage in appDataFolder
The system SHALL read and write a single file named `markdown-editor-backup.json` exclusively in the Drive `appDataFolder` space, using only the `drive.appdata` scope. See `docs/data-and-privacy.md`.

#### Scenario: Create on first upload
- **WHEN** no backup file exists
- **THEN** it is created with POST (multipart) under parent `appDataFolder`

Covered by: none (untested)

#### Scenario: Update existing backup
- **WHEN** a backup file already exists
- **THEN** it is overwritten with PATCH, not duplicated

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Lookup failure
- **WHEN** the file listing returns a non-2xx response
- **THEN** it throws an error built from the response body and does not create a duplicate

Covered by: src/features/drive-sync/google-drive-provider.test.ts

### Requirement: Backup payload format
The system SHALL upload a JSON document with `version: 1`, `exportedAt`, `projects` and `tombstones` (empty object when absent), and SHALL record `lastDriveSync` only after a successful upload. Tombstone semantics are defined in ADR 0004 (`docs/adr/0004-sync-tombstones.md`).

#### Scenario: Tombstones uploaded
- **WHEN** the snapshot carries tombstones
- **THEN** they are uploaded next to `projects`

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Last-sync bookkeeping
- **WHEN** an upload succeeds
- **THEN** `lastDriveSync` is stored

Covered by: src/features/drive-sync/google-drive-provider.test.ts

### Requirement: Pull
The system SHALL download the backup and return its `projects` and `tombstones`, resolve `null` when no backup exists, and reject with "Formato de backup inválido" when the body is not valid JSON or lacks `projects`.

#### Scenario: No backup yet
- **WHEN** no backup file exists
- **THEN** pull resolves to null

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Well-formed backup
- **WHEN** the backup has projects, with or without tombstones
- **THEN** pull returns projects and tombstones, or `undefined` tombstones for an older backup

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Malformed backup
- **WHEN** the body is invalid JSON or lacks `projects`
- **THEN** pull rejects with "Formato de backup inválido"

Covered by: src/features/drive-sync/google-drive-provider.test.ts

#### Scenario: Not connected
- **WHEN** pull is called without a token
- **THEN** it rejects with "Not connected to Drive"

Covered by: none (untested)

### Requirement: Sync flow
The system SHALL sync by pulling, reconciling the result with local state through the injected `reconcile` callback, and pushing the merged snapshot, only on connect or explicit user action and never on a timer.

#### Scenario: Connect then manual sync
- **WHEN** the user connects, then triggers a sync
- **THEN** each of the two runs one pull-reconcile-push sequence

Covered by: src/features/drive-sync/useDriveSync.test.ts

#### Scenario: No background polling
- **WHEN** the user stays connected
- **THEN** no further syncs start automatically

Covered by: src/features/drive-sync/useDriveSync.test.ts

#### Scenario: Success feedback
- **WHEN** a manual sync succeeds
- **THEN** "☁️ Sincronizado" is toasted and `lastSyncedAt` updates, while the connect-time sync suppresses that toast

Covered by: none (untested)

#### Scenario: Sync failure
- **WHEN** pull, reconcile or push throws
- **THEN** an error toast "Erro ao sincronizar: <message>" is shown

Covered by: none (untested)

### Requirement: Single sync in flight
The system SHALL ignore a sync request while another pull-reconcile-push sequence is running, including the one started by connect.

#### Scenario: Overlapping requests
- **WHEN** two sync calls overlap, or a sync arrives during the connect-time sync
- **THEN** only one sequence runs

Covered by: src/features/drive-sync/useDriveSync.test.ts

### Requirement: Offline behaviour
The system SHALL skip manual sync and connect with a warning toast while offline, and SHALL make push throw `DriveSyncOfflineError` (reported as a warning toast, status `connected-offline`) when the browser goes offline during a sync.

#### Scenario: Sync requested offline
- **WHEN** the user triggers a sync while offline
- **THEN** a warning toast is shown and no network request is made

Covered by: none (untested)

#### Scenario: Push while offline
- **WHEN** push runs with the browser offline
- **THEN** status becomes `connected-offline` and it throws `DriveSyncOfflineError`

Covered by: none (untested)

### Requirement: Connection-dependent entry points
The system SHALL expose `needsConfig` as true whenever Drive is not configured or not connected, and SHALL use it to redirect the cloud icon and Ctrl+S / Cmd+S to the config modal.

#### Scenario: needsConfig values
- **WHEN** no Client ID is stored, or configured but not connected, or both
- **THEN** `needsConfig` is true, true and false respectively

Covered by: src/features/drive-sync/useDriveSync.test.ts

#### Scenario: Shortcut while connected
- **WHEN** the sync signal nonce changes and `needsConfig` is false
- **THEN** `sync()` runs once per nonce

Covered by: src/features/drive-sync/DriveSyncPanel.test.tsx

#### Scenario: Shortcut while not connected
- **WHEN** the nonce changes and `needsConfig` is true
- **THEN** a warning toast is shown, the config modal is requested and no sync runs

Covered by: src/features/drive-sync/DriveSyncPanel.test.tsx

#### Scenario: Cloud button
- **WHEN** the user clicks the header cloud button
- **THEN** `onClickCloudButton` is called

Covered by: src/features/drive-sync/DriveSyncPanel.test.tsx

### Requirement: Config panel display
The system SHALL show configured/not-configured status, connection status, last-synced text and an enabled Connect or Disconnect button depending on state, and SHALL disable Connect when not configured or busy.

#### Scenario: Status rendering
- **WHEN** the panel is open for a configured, not connected state
- **THEN** a Connect button calls `connect()`

Covered by: src/features/drive-sync/DriveConfigPanel.test.tsx

#### Scenario: Connected rendering
- **WHEN** the state is connected
- **THEN** "Conectado como <name>", the last-synced text and a working Disconnect button are shown

Covered by: src/features/drive-sync/DriveConfigPanel.test.tsx

#### Scenario: Connect disabled
- **WHEN** the Client ID is not configured
- **THEN** the Connect button is disabled

Covered by: src/features/drive-sync/DriveConfigPanel.test.tsx

#### Scenario: Offline note
- **WHEN** the browser is offline
- **THEN** the panel shows the offline note, and the cloud icon shows an offline badge

Covered by: none (untested)

### Requirement: Last-synced formatting
The system SHALL format `lastSyncedAt` as relative time, and SHALL show "⚠️ Nunca sincronizado" when it is null.

#### Scenario: Never synced
- **WHEN** `lastSyncedAt` is null
- **THEN** `formatLastSynced` returns null

Covered by: src/features/drive-sync/formatLastSynced.test.ts

#### Scenario: Known timestamp
- **WHEN** `lastSyncedAt` is set
- **THEN** the result is delegated to `formatRelativeTime`

Covered by: src/features/drive-sync/formatLastSynced.test.ts

### Requirement: TODO: provider-level Client ID validation
The system SHALL refuse to connect with an empty Client ID at the provider level, but `connect()` only rejects the placeholder.

#### Scenario: Empty Client ID
- **WHEN** `GoogleDriveSyncProvider.connect()` runs with nothing stored
- **THEN** it should fail fast with a configuration error instead of calling GIS with an empty `client_id`

Evidence: `src/features/drive-sync/google-drive-provider.ts:143` checks `isPlaceholderClientId` while `reconnectSilently` (line 174) uses `isClientIdConfigured`; the error toast text "Configure o CLIENT_ID no código" is also stale. The UI disables Connect, so only direct callers are exposed.

Covered by: none (untested)

### Requirement: TODO: push must not report success after silently skipping
The system SHALL NOT report "☁️ Sincronizado" or update `lastSyncedAt` when push uploaded nothing.

#### Scenario: Token cleared before upload
- **WHEN** the silent refresh inside push clears the token after pull succeeded
- **THEN** the sync should surface an error or "not connected" state instead of a success toast

Evidence: `src/features/drive-sync/google-drive-provider.ts:499` and `:521` return without throwing when the token is missing, and `src/features/drive-sync/useDriveSync.ts:187` then toasts success.

Covered by: none (untested)

### Requirement: TODO: pull must guard against offline
The system SHALL fail with the offline error from pull, as push already does, so the reconcile step does not run against a failed download.

#### Scenario: Browser goes offline between sync start and pull
- **WHEN** `pull()` runs while `isNavigatorOnline()` is false
- **THEN** it should throw `DriveSyncOfflineError` rather than a raw fetch failure shown as "Erro ao sincronizar"

Evidence: only `push` checks `isNavigatorOnline` (`src/features/drive-sync/google-drive-provider.ts:505`); `pull` (line 533) has no such check.

Covered by: none (untested)

### Requirement: TODO: in-app privacy disclosure before connecting
The system SHALL show the in-app pt-BR disclosure that `docs/data-and-privacy.md` says is shown before connecting.

#### Scenario: Disclosure visible before Connect
- **WHEN** the config panel is open and the user is not connected
- **THEN** a disclosure about the `appDataFolder` scope and memory-only token should be visible

Evidence: `docs/data-and-privacy.md` ("Where this is enforced in code") cites `copy.ts` and `DriveSyncPanel.tsx`, but `copy.ts` only has `helpText` about creating Google Cloud credentials and `DriveSyncPanel.tsx` renders only the cloud icon and offline badge.

Covered by: none (untested)
