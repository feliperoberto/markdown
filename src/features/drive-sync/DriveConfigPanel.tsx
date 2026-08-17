import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { Button, Modal } from '@/components'
import { driveSyncCopy } from './copy'
import { formatLastSynced } from './formatLastSynced'
import { DriveConnectionStatus } from './DriveConnectionStatus'
import { appVersion } from '@/lib/app-version'
import styles from './DriveConfigPanel.module.css'

export interface DriveConfigPanelProps {
  open: boolean
  onClose: () => void
  connected: boolean
  userName: string | null
  busy: boolean
  isOnline: boolean
  lastSyncedAt: number | null
  configured: boolean
  /** The persisted Client ID, used to seed the form's initial value. */
  storedClientId: string
  connect: () => Promise<void>
  disconnect: () => void
  /** Validates, persists, and reflects a new Client ID; returns whether it was accepted. */
  saveClientId: (value: string) => boolean
  clearClientId: () => void
}

const TITLE_ID = 'drive-config-panel-title'

/**
 * Sidebar gear-icon entry point + panel for Google Drive configuration
 * (issue #110: split out of the combined config+sync panel — this half
 * owns Client ID setup and the Connect/Disconnect action; the sync
 * trigger itself is just the header cloud icon in `DriveSyncPanel`, which
 * has no button of its own — see its doc comment). All connection/sync
 * state is owned by `useDriveSync` in `src/app/app.tsx` and passed down as
 * props, so this panel and `DriveSyncPanel` always agree on the current
 * connection status instead of each holding its own possibly-stale copy.
 */
export function DriveConfigPanel({
  open,
  onClose,
  connected,
  userName,
  busy,
  isOnline,
  lastSyncedAt,
  configured,
  storedClientId,
  connect,
  disconnect,
  saveClientId,
  clearClientId,
}: DriveConfigPanelProps): JSX.Element {
  // Local, unsaved form value — deliberately separate from `storedClientId`
  // (the persisted value `configured` is derived from). Seeded once from
  // the persisted value at mount; typing here doesn't need to react to
  // external changes to storage.
  const [clientId, setClientIdInput] = useState(storedClientId)

  function handleSaveClientId(event: Event) {
    event.preventDefault()
    if (saveClientId(clientId)) {
      setClientIdInput(clientId.trim())
    }
  }

  function handleClearClientId() {
    clearClientId()
    setClientIdInput('')
  }

  return (
    <Modal open={open} onClose={onClose} titleId={TITLE_ID} title="Configurações do Google Drive">
      <div class={styles.modalBody}>
        {!isOnline && <p class={styles.disclosureNote}>{driveSyncCopy.offlineStatus}</p>}

        <form class={styles.clientIdForm} onSubmit={handleSaveClientId}>
          <label class="config-label" htmlFor="drive-client-id">
            {driveSyncCopy.clientIdLabel}
          </label>
          <input
            id="drive-client-id"
            class="config-input"
            type="text"
            value={clientId}
            placeholder={driveSyncCopy.clientIdPlaceholder}
            onInput={(event) => setClientIdInput((event.target as HTMLInputElement).value)}
          />
          <div class={`config-status ${configured ? 'configured' : 'not-configured'}`}>
            {configured ? driveSyncCopy.configuredStatus : driveSyncCopy.notConfiguredStatus}
          </div>
          <p class={styles.disclosureNote}>{driveSyncCopy.helpText}</p>
          <div class={styles.actionRow}>
            <Button type="submit" variant="default">
              Salvar Client ID
            </Button>
            <Button variant="default" onClick={handleClearClientId}>
              Limpar
            </Button>
          </div>
        </form>

        <DriveConnectionStatus userName={userName} />

        {connected && (
          <p class={styles.disclosureNote}>
            {formatLastSynced(lastSyncedAt)
              ? `🕐 Última sincronização: ${formatLastSynced(lastSyncedAt)}`
              : driveSyncCopy.neverSyncedStatus}
          </p>
        )}

        <div class={styles.actionRow}>
          {connected ? (
            <Button variant="danger" disabled={busy} onClick={disconnect}>
              {driveSyncCopy.disconnectButtonLabel}
            </Button>
          ) : (
            <Button variant="primary" disabled={busy || !configured} onClick={() => void connect()}>
              {driveSyncCopy.connectButtonLabel}
            </Button>
          )}
        </div>
        <p class={styles.appVersion}>{`Versão ${appVersion}`}</p>
      </div>
    </Modal>
  )
}
