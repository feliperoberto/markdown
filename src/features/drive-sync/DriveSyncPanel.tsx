import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { Button, IconButton, Modal, useToast } from '@/components'
import { driveSyncCopy } from './copy'
import { formatLastSynced } from './formatLastSynced'
import { DriveConnectionStatus } from './DriveConnectionStatus'
import { appVersion } from '@/lib/app-version'
import styles from './DriveSyncPanel.module.css'

export interface DriveSyncPanelProps {
  connected: boolean
  userName: string | null
  busy: boolean
  isOnline: boolean
  lastSyncedAt: number | null
  configured: boolean
  sync: () => Promise<void>
  disconnect: () => void
  /**
   * "Fire an event" signal from `src/app/` for the Ctrl+S/Cmd+S shortcut
   * (`action: 'sync'`, `useSaveShortcut`). A save shortcut has no business
   * reaching into this component directly (see CONTRIBUTING.md's "Feature
   * taxonomy"), so `src/app/app.tsx` bumps `nonce` instead of calling
   * anything on this component. `nonce` (not just `action` changing) is
   * what actually triggers the effect — two 'sync' requests in a row must
   * each be observed, not just the first. `undefined` on mount so nothing
   * fires at startup.
   */
  actionSignal?: { action: 'sync'; nonce: number }
  /** Whether the sync modal should be open (controlled by parent). */
  open: boolean
  /** Callback when the user wants to close the modal. */
  onClose: () => void
  /** Callback when the user clicks the header cloud button to open the modal. */
  onClickCloudButton?: () => void
  /**
   * Callback when Ctrl+S/Cmd+S is pressed but Drive is not configured yet.
   * Should open the config modal so the user can configure.
   */
  onRequestConfig?: () => void
}

const TITLE_ID = 'drive-sync-panel-title'

/**
 * Header cloud-icon entry point + panel for triggering a Google Drive sync
 * (issue #110: split out of the combined config+sync panel — this half
 * owns only sync status/action, never Client ID configuration, which lives
 * in `DriveConfigPanel`). All connection/sync state is owned by
 * `useDriveSync` in `src/app/app.tsx` and passed down as props — this
 * component is purely presentational plus the Ctrl+S/Cmd+S signal handler.
 */
export function DriveSyncPanel({
  connected,
  userName,
  busy,
  isOnline,
  lastSyncedAt,
  configured,
  sync,
  disconnect,
  actionSignal,
  open,
  onClose,
  onClickCloudButton,
  onRequestConfig,
}: DriveSyncPanelProps): JSX.Element {
  const showToast = useToast()

  // "Fire an event" signal from src/app/ for the Ctrl+S/Cmd+S shortcut —
  // see actionSignal's doc comment. `nonce` alone drives the deps array,
  // so two same-action requests in a row are each observed. `configured`/
  // `connected`/`sync`/`onRequestConfig` are deliberately NOT tracked as
  // dependencies and are read fresh via closure from whichever render last
  // changed `nonce` — if they were tracked, this would re-fire (and
  // re-sync) merely because e.g. `connected` flipped from a manual Connect
  // click, with no new keypress.
  useEffect(() => {
    if (actionSignal === undefined) return
    if (!configured || !connected) {
      // Not configured/connected — guide the user to the config panel so
      // they can set up Drive first. Show a warning toast and open the
      // config modal.
      showToast(driveSyncCopy.syncNeedsConnectionToast, 'warning')
      onRequestConfig?.()
      return
    }
    void sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSignal?.nonce])

  return (
    <>
      <span class={styles.iconWrapper}>
        <IconButton
          icon="☁️"
          label="Sincronizar com Google Drive"
          title={driveSyncCopy.syncShortcutHint}
          ariaHasPopup="dialog"
          onClick={onClickCloudButton}
        />
        {!isOnline && (
          <span class={styles.offlineBadge} role="status" title={driveSyncCopy.offlineBadgeTitle}>
            <span class="visually-hidden">{driveSyncCopy.offlineBadgeLabel}</span>
          </span>
        )}
      </span>
      <Modal open={open} onClose={onClose} titleId={TITLE_ID} title="Sincronizar com Google Drive">
        <div class={styles.modalBody}>
          {!isOnline && <p class={styles.offlineNotice}>{driveSyncCopy.offlineStatus}</p>}

          <DriveConnectionStatus userName={userName} />

          {connected && (
            <p class={styles.disclosureNote}>
              {formatLastSynced(lastSyncedAt)
                ? `🕐 Última sincronização: ${formatLastSynced(lastSyncedAt)}`
                : driveSyncCopy.neverSyncedStatus}
            </p>
          )}

          {!connected && (
            <p class={styles.disclosureNote}>
              Configure sua conta Google Drive usando o botão de configurações para sincronizar seus
              projetos.
            </p>
          )}

          <div class={styles.actionRow}>
            {connected ? (
              <>
                <Button variant="danger" disabled={busy} onClick={disconnect}>
                  {driveSyncCopy.disconnectButtonLabel}
                </Button>
                <Button variant="default" disabled={busy} onClick={() => void sync()}>
                  {driveSyncCopy.syncButtonLabel}
                </Button>
              </>
            ) : (
              <p class={styles.disclosureNote}>
                Use o botão de configurações (⚙️) na barra lateral para conectar sua conta Google
                Drive.
              </p>
            )}
          </div>
          <p class={styles.appVersion}>{`Versão ${appVersion}`}</p>
        </div>
      </Modal>
    </>
  )
}
