import type { JSX } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Button, IconButton, Modal, useToast } from '@/components'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { DriveSyncOfflineError, GoogleDriveSyncProvider } from './google-drive-provider'
import type { DriveSyncDotStatus } from './google-drive-provider'
import { driveSyncCopy } from './copy'
import { formatLastSynced } from './formatLastSynced'
import {
  clearStoredClientId,
  getStoredClientId,
  isClientIdConfigured,
  setStoredClientId,
} from './config'
import type { ProjectsSnapshot } from './types'
import styles from './DriveSyncPanel.module.css'

export interface DriveSyncPanelProps {
  /**
   * Reconciles a just-pulled remote snapshot (`null` if nothing has been
   * synced yet) with local state by per-file freshness — applies the
   * merged result to local state and returns it, so it can also be pushed
   * back to Drive. Injected from `src/app/`: this panel only ever sees the
   * opaque `ProjectsSnapshot` shape, never the `projects`-feature's
   * concrete types (see `SyncProvider`'s doc comment on why the merge
   * logic itself can't live in this feature).
   */
  reconcile: (remote: ProjectsSnapshot | null) => ProjectsSnapshot
  /**
   * Lets a second entry point (the sidebar's prototype-matching "⚙️
   * Config" footer button) open the SAME modal instance instead of
   * spawning a second one with its own disconnected state. Uncontrolled
   * (manages its own open/close) when omitted — the header's own cloud
   * icon trigger doesn't need this.
   */
  openSignal?: number
}

const TITLE_ID = 'drive-sync-panel-title'

/**
 * Toolbar entry point + panel for the Google Drive sync provider (#21).
 * Wires `GoogleDriveSyncProvider` (connect/pull/push/disconnect) into the
 * shared `Modal`/`Toast`/`Button` components. A single "Sincronizar" button
 * drives a full bidirectional, freshness-based reconcile — see
 * `handleSync`'s doc comment.
 */
export function DriveSyncPanel({ reconcile, openSignal }: DriveSyncPanelProps): JSX.Element {
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<DriveSyncDotStatus>('offline')
  const [user, setUser] = useState<string | null>(null)
  const [clientId, setClientIdInput] = useState(() => getStoredClientId())
  const [busy, setBusy] = useState(false)
  const isOnline = useOnlineStatus()

  // Always dereferenced fresh from the provider's onNotify callback, so
  // showToast's identity never needs to be a useMemo dependency below.
  // Previously the provider was recreated whenever showToast changed
  // (harmless today only because Toast.tsx happens to return a stable
  // reference) — a provider rebuild mid-session would orphan the OLD
  // instance's running auto-sync setInterval with no way to stop it from
  // the UI, since providerRef would only ever point at the new instance.
  const showToastRef = useRef(showToast)
  showToastRef.current = showToast

  // Created exactly once for the component's lifetime — no dependency
  // that could ever cause a rebuild.
  const provider = useMemo(
    () =>
      new GoogleDriveSyncProvider({
        onStatusChange: setStatus,
        onUserResolved: setUser,
        onNotify: (message, kind) => showToastRef.current(message, kind),
      }),
    [],
  )
  const providerRef = useRef(provider)
  providerRef.current = provider

  // Revokes the token if this panel ever unmounts while connected. It
  // never unmounts in the current app shell (always rendered in the
  // header), so this is a latent-only safety net.
  useEffect(() => {
    return () => providerRef.current.disconnect()
  }, [])

  // Any change to openSignal's value (a simple incrementing counter) opens
  // the modal — this is a "fire an event" signal, not a value to sync
  // against, so it intentionally does NOT compare against a previous
  // value; effect deps already guarantee it only re-runs on an actual change.
  useEffect(() => {
    if (openSignal !== undefined) setOpen(true)
  }, [openSignal])

  // Derived from the PERSISTED client ID (what `connect()` actually
  // reads), not the live/unsaved input — see Fix 5.
  const [storedClientId, setStoredClientIdState] = useState(() => getStoredClientId())
  const configured = isClientIdConfigured(storedClientId)

  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(
    () => providerRef.current.getStatus().lastSyncedAt,
  )

  function handleSaveClientId(event: Event) {
    event.preventDefault()
    const trimmed = clientId.trim()
    if (!trimmed) {
      // Prototype parity: an empty/whitespace Client ID was rejected
      // rather than silently persisted with a success toast, which left
      // Connect disabled with no explanation of why.
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

  async function handleConnect() {
    if (!isOnline) {
      showToast(driveSyncCopy.offlineSyncSkippedToast, 'warning')
      return
    }
    setBusy(true)
    try {
      await providerRef.current.connect()
      // Sync once, right after connecting (issue #92): the old behavior
      // started a background setInterval polling loop that periodically
      // re-requested a Drive token — the OAuth popup that loop triggered
      // stole focus from the editor mid-typing. Sync now runs only here
      // (on connect) and from the explicit "Sincronizar" button, never on
      // a timer. Silent on success so it doesn't stack a second toast on
      // top of the "Drive conectado" one; errors still surface.
      await performSync({ silentSuccess: true })
    } catch {
      // Only connect() can throw here (performSync handles its own errors);
      // its failure was already surfaced as a toast via the provider's
      // onNotify callback.
    } finally {
      setBusy(false)
    }
  }

  function handleDisconnect() {
    providerRef.current.disconnect()
    setUser(null)
  }

  // The shared pull → reconcile → push sequence, replacing the old
  // two-button "Sincronizar Agora" (blind push, could clobber newer remote
  // edits) / "Restaurar do Drive" (blind local-wins pull) pair. Always
  // pulls first, reconciles by per-file freshness (see `reconcile`'s doc
  // comment), then pushes the merged result back — so neither direction
  // can silently overwrite the other's newer data. Runs both on connect
  // and from the manual button; never on a background timer (issue #92).
  //
  // Owns its own error messaging (rather than throwing to each caller) so a
  // connect-time sync failure surfaces to the user just like a manual one —
  // reconcile/push errors don't flow through the provider's onNotify, so a
  // caller that swallowed the throw would leave the user thinking they'd
  // synced when nothing was pushed. `silentSuccess` suppresses only the
  // success toast (used on connect, to avoid stacking it on "Drive
  // conectado"); errors always show.
  async function performSync({ silentSuccess = false } = {}) {
    try {
      const remote = await providerRef.current.pull()
      const merged = reconcile(remote)
      await providerRef.current.push(merged)
      setLastSyncedAt(providerRef.current.getStatus().lastSyncedAt)
      if (!silentSuccess) showToast(driveSyncCopy.syncCompleteToast, 'success')
    } catch (error) {
      if (error instanceof DriveSyncOfflineError) {
        // Distinct, reassuring copy — not a scary generic error (issue #24).
        showToast(driveSyncCopy.offlineWillRetrySync, 'warning')
      } else {
        console.error('Sync error:', error)
        showToast(`Erro ao sincronizar: ${(error as Error).message}`, 'error')
      }
    }
  }

  // Manual "Sincronizar" button handler: wraps performSync with the
  // online-precheck and busy state.
  async function handleSync() {
    if (!isOnline) {
      // Fail fast with the reassuring offline copy instead of letting the
      // request hit the network and surface a raw "Failed to fetch"
      // through the provider's generic error-handling path.
      showToast(driveSyncCopy.offlineSyncSkippedToast, 'warning')
      return
    }
    setBusy(true)
    try {
      await performSync()
    } finally {
      setBusy(false)
    }
  }

  // 'connected-offline' means "authenticated but currently offline" — keep
  // treating it as connected (the Sync button stays visible) rather than
  // falling back to the never-connected 'offline' state (finding #1).
  // The offline badge/notice below is driven independently by
  // `useOnlineStatus()`, so it still shows regardless of this value.
  const connected = status === 'connected' || status === 'syncing' || status === 'connected-offline'

  return (
    <>
      <span class={styles.iconWrapper}>
        <IconButton
          icon="☁️"
          label="Sincronização com Google Drive"
          ariaHasPopup="dialog"
          onClick={() => setOpen(true)}
        />
        {!isOnline && (
          <span class={styles.offlineBadge} role="status" title={driveSyncCopy.offlineBadgeTitle}>
            <span class={styles.visuallyHidden}>{driveSyncCopy.offlineBadgeLabel}</span>
          </span>
        )}
      </span>
      <Modal open={open} onClose={() => setOpen(false)} titleId={TITLE_ID} title="Google Drive">
        <div class={styles.modalBody}>
          {!isOnline && <p class={styles.offlineNotice}>{driveSyncCopy.offlineStatus}</p>}
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
              {user ? '✅' : '☁️'}
            </span>
            {user ? (
              <div class="drive-status-text">
                <span class="drive-status-name">{`Conectado como ${user}`}</span>
              </div>
            ) : (
              <span class="drive-status-text">{driveSyncCopy.notConnectedStatus}</span>
            )}
          </div>
          {connected && (
            <p class={styles.disclosureNote}>
              {formatLastSynced(lastSyncedAt)
                ? `🕐 Última sincronização: ${formatLastSynced(lastSyncedAt)}`
                : driveSyncCopy.neverSyncedStatus}
            </p>
          )}

          <div class={styles.actionRow}>
            {connected ? (
              <Button variant="danger" disabled={busy} onClick={handleDisconnect}>
                {driveSyncCopy.disconnectButtonLabel}
              </Button>
            ) : (
              <Button variant="primary" disabled={busy || !configured} onClick={handleConnect}>
                {driveSyncCopy.connectButtonLabel}
              </Button>
            )}
            <Button variant="default" disabled={busy || !connected} onClick={handleSync}>
              {driveSyncCopy.syncButtonLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
