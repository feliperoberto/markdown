import type { JSX } from 'preact'
import { useMemo, useRef, useState } from 'preact/hooks'
import { Button, IconButton, Modal, useToast } from '@/components'
import { GoogleDriveSyncProvider } from './google-drive-provider'
import type { DriveSyncDotStatus } from './google-drive-provider'
import { driveSyncCopy } from './copy'
import {
  clearStoredClientId,
  getStoredClientId,
  isClientIdConfigured,
  setStoredClientId,
} from './config'
import type { ProjectsSnapshot } from './types'

export interface DriveSyncPanelProps {
  /** Current projects snapshot to push whenever "Sincronizar agora" runs. */
  getSnapshot: () => ProjectsSnapshot
  /** Called with a Drive backup's `projects` payload after a successful restore. */
  onImported: (projects: Record<string, unknown>) => void
}

const TITLE_ID = 'drive-sync-panel-title'

/**
 * Toolbar entry point + panel for the Google Drive sync provider (#21).
 * Wires `GoogleDriveSyncProvider` (connect/sync/disconnect) into the
 * shared `Modal`/`Toast`/`Button` components — the sync algorithm itself
 * is untouched.
 */
export function DriveSyncPanel({ getSnapshot, onImported }: DriveSyncPanelProps): JSX.Element {
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<DriveSyncDotStatus>('offline')
  const [user, setUser] = useState<string | null>(null)
  const [clientId, setClientIdInput] = useState(() => getStoredClientId())
  const [busy, setBusy] = useState(false)

  const provider = useMemo(
    () =>
      new GoogleDriveSyncProvider({
        onStatusChange: setStatus,
        onUserResolved: setUser,
        onNotify: (message, kind) => showToast(message, kind),
      }),
    [showToast],
  )
  const providerRef = useRef(provider)
  providerRef.current = provider

  const configured = isClientIdConfigured(clientId)

  function handleSaveClientId(event: Event) {
    event.preventDefault()
    setStoredClientId(clientId.trim())
    showToast('Client ID salvo', 'success')
  }

  function handleClearClientId() {
    clearStoredClientId()
    setClientIdInput(getStoredClientId())
  }

  async function handleConnect() {
    setBusy(true)
    try {
      await providerRef.current.connect()
      providerRef.current.startAutoSync(getSnapshot)
    } catch {
      // onNotify already surfaced the error as a toast.
    } finally {
      setBusy(false)
    }
  }

  function handleDisconnect() {
    providerRef.current.disconnect()
    setUser(null)
  }

  async function handleSyncNow() {
    setBusy(true)
    try {
      await providerRef.current.sync(getSnapshot())
    } catch {
      // onNotify already surfaced the error as a toast.
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const projects = await providerRef.current.importFromDrive()
      onImported(projects)
      showToast('Projetos restaurados do Drive', 'success')
    } catch (error) {
      showToast(`Erro ao restaurar: ${(error as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const connected = status === 'connected' || status === 'syncing'

  return (
    <>
      <IconButton
        icon="☁"
        label="Sincronização com Google Drive"
        ariaHasPopup="dialog"
        onClick={() => setOpen(true)}
      />
      <Modal open={open} onClose={() => setOpen(false)} titleId={TITLE_ID} title="Google Drive">
        <form onSubmit={handleSaveClientId}>
          <label htmlFor="drive-client-id">{driveSyncCopy.clientIdLabel}</label>
          <input
            id="drive-client-id"
            type="text"
            value={clientId}
            placeholder={driveSyncCopy.clientIdPlaceholder}
            onInput={(event) => setClientIdInput((event.target as HTMLInputElement).value)}
          />
          <p>{driveSyncCopy.clientIdSecurityNote}</p>
          <p>{configured ? driveSyncCopy.configuredStatus : driveSyncCopy.notConfiguredStatus}</p>
          <p>{driveSyncCopy.helpText}</p>
          <Button type="submit" variant="default">
            Salvar Client ID
          </Button>
          <Button variant="default" onClick={handleClearClientId}>
            Limpar
          </Button>
        </form>

        <p>{user ? `Conectado como ${user}` : driveSyncCopy.notConnectedStatus}</p>

        <div>
          {connected ? (
            <Button variant="danger" disabled={busy} onClick={handleDisconnect}>
              {driveSyncCopy.disconnectButtonLabel}
            </Button>
          ) : (
            <Button variant="primary" disabled={busy || !configured} onClick={handleConnect}>
              {driveSyncCopy.connectButtonLabel}
            </Button>
          )}
          <Button variant="default" disabled={busy || !connected} onClick={handleSyncNow}>
            {driveSyncCopy.syncButtonLabel}
          </Button>
          <Button variant="default" disabled={busy || !connected} onClick={handleRestore}>
            {driveSyncCopy.importButtonLabel}
          </Button>
        </div>
      </Modal>
    </>
  )
}
