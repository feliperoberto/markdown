import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { Button, Modal, useToast } from '@/components'
import {
  clearStoredClientId,
  getStoredClientId,
  isClientIdConfigured,
  setStoredClientId,
} from './config'
import { driveSyncCopy } from './copy'
import styles from './DriveConfigPanel.module.css'

export interface DriveConfigPanelProps {
  open: boolean
  onClose: () => void
  connectionStatus: 'connected' | 'disconnected'
  userName: string | null
  lastSyncedAt: number | null
}

const TITLE_ID = 'drive-config-panel-title'

export function DriveConfigPanel({
  open,
  onClose,
  connectionStatus,
  userName,
  lastSyncedAt,
}: DriveConfigPanelProps): JSX.Element {
  const showToast = useToast()
  const [clientId, setClientIdInput] = useState(() => getStoredClientId())
  const [storedClientId, setStoredClientIdState] = useState(() => getStoredClientId())
  const configured = isClientIdConfigured(storedClientId)

  function handleSaveClientId(event: Event) {
    event.preventDefault()
    const trimmed = clientId.trim()
    if (!trimmed) {
      showToast(driveSyncCopy.clientIdEmptyWarning, 'warning')
      return
    }
    setStoredClientId(trimmed)
    setStoredClientIdState(trimmed)
    showToast(driveSyncCopy.clientIdSavedToast, 'success')
  }

  function handleClearClientId() {
    clearStoredClientId()
    setClientIdInput(getStoredClientId())
    setStoredClientIdState(getStoredClientId())
    showToast(driveSyncCopy.clientIdClearedToast, 'success')
  }

  const formatLastSynced = (timestamp: number | null) => {
    if (!timestamp) return null
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'agora'
    if (diffMins < 60) return `${diffMins}m atrás`
    if (diffHours < 24) return `${diffHours}h atrás`
    if (diffDays < 7) return `${diffDays}d atrás`
    return date.toLocaleDateString('pt-BR')
  }

  return (
    <Modal open={open} onClose={onClose} titleId={TITLE_ID} title="Configurações do Google Drive">
      <div class={styles.modalBody}>
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

        <div class="drive-status">
          <span class="drive-status-icon" aria-hidden="true">
            {userName ? '✅' : '☁️'}
          </span>
          {userName ? (
            <div class="drive-status-text">
              <span class="drive-status-name">{`Conectado como ${userName}`}</span>
            </div>
          ) : (
            <span class="drive-status-text">{driveSyncCopy.notConnectedStatus}</span>
          )}
        </div>

        {connectionStatus === 'connected' && lastSyncedAt && (
          <p class={styles.disclosureNote}>
            {formatLastSynced(lastSyncedAt)
              ? `🕐 Última sincronização: ${formatLastSynced(lastSyncedAt)}`
              : driveSyncCopy.neverSyncedStatus}
          </p>
        )}
      </div>
    </Modal>
  )
}
