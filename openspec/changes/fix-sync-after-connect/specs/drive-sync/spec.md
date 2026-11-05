# Spec Delta

## MODIFIED Requirements

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

#### Scenario: Connect-time sync uses current local state
- **WHEN** local projects change while the interactive connect is still in progress
- **THEN** the sync that runs right after connecting reconciles and pushes the latest local projects, not the ones that existed when Connect was clicked

#### Scenario: Connect-time sync uploads data
- **WHEN** an interactive connect succeeds while online
- **THEN** a snapshot is uploaded to Drive before the connect action finishes

## REMOVED Requirements

### Requirement: TODO: push must not report success after silently skipping
**Reason**: Replaced by the requirement "Push fails when not connected", which turns this TODO into normative behavior.
**Migration**: None; the behavior is now specified and tested.

## ADDED Requirements

### Requirement: Push fails when not connected
The system SHALL make push fail with a "not connected" error when no access token is available, either at the start or after a failed silent refresh, so the sync reports an error instead of success and leaves `lastSyncedAt` unchanged.

#### Scenario: Token cleared before upload
- **WHEN** the silent refresh inside push clears the token after pull succeeded
- **THEN** an error toast "Erro ao sincronizar: <message>" is shown, no success toast appears, and `lastSyncedAt` is unchanged

#### Scenario: Push without a token
- **WHEN** push is called while disconnected
- **THEN** it rejects without uploading
