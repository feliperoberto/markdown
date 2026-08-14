import type { JSX } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Button, IconButton, Modal, useToast } from '@/components'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { appVersion } from '@/lib/app-version'
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
   * "Fire an event" signal from `src/app/` for the two entry points that
   * live outside this component: the sidebar's "⚙️ Config" footer button
   * (`action: 'open'`) and the Ctrl+S/Cmd+S shortcut (`action: 'sync'`,
   * `useSaveShortcut`). A save shortcut has no business reaching into a
   * sibling feature's internals directly (see CONTRIBUTING.md's "Feature
   * taxonomy"), so `src/app/app.tsx` bumps `nonce` instead of calling
   * anything on this component. `nonce` (not just `action` changing) is
   * what actually triggers the effect below — two 'sync' requests in a row
   * must each be observed, not just the first. Uncontrolled (manages its
   * own open/close) when omitted — the header's own cloud icon trigger
   * doesn't need this. `undefined` on mount so nothing fires at startup.
   */
  actionSignal?: { action: 'open' | 'sync'; nonce: number }
}

const TITLE_ID = 'drive-sync-panel-title'

/**
 * Toolbar entry point + panel for the Google Drive sync provider (#21).
 * Wires `GoogleDriveSyncProvider` (connect/pull/push/disconnect) into the
 * shared `Modal`/`Toast`/`Button` components. A single "Sincronizar" button
 * drives a full bidirectional, freshness-based reconcile — see
 * `handleSync`'s doc comment.
 */
export function DriveSyncPanel({ reconcile, actionSignal }: DriveSyncPanelProps): JSX.Element {
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<DriveSyncDotStatus>('offline')
  const [user, setUser] = useState<string | null>(null)
  const [clientId, setClientIdInput] = useState(() => getStoredClientId())
  const [busy, setBusy] = useState(false)
  const isOnline = useOnlineStatus()

  // Always dereferenced fresh from the provider's onNotify callback, so
  // showToast's identity never needs to be a useMemo dependency below —
  // the provider below is created exactly once (empty deps) and should
  // stay that way, since a rebuild mid-session would orphan the OLD
  // instance's in-memory accessToken/connection state with no way to
  // disconnect it from the UI (providerRef would only ever point at the
  // new instance).
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

  // Guards against overlapping `pull → reconcile → push` sequences —
  // rapid repeat Ctrl+S presses, a mash of the button + the shortcut, or a
  // shortcut press landing while the connect-time sync (handleConnect's own
  // performSync call, below) is still in flight. `busy` (state) isn't
  // enough on its own: a call dispatched before React/Preact has committed
  // a previous `setBusy(true)` could still read the old `busy` value and
  // pass the check. A ref is updated synchronously, so a second call sees
  // the first one's guard immediately, with no render in between. Lives on
  // `performSync` itself (the one shared entry point every caller funnels
  // through — handleSync AND handleConnect) rather than on any individual
  // caller, so no future caller can bypass it by forgetting to check it.
  const syncInFlightRef = useRef(false)

  // Revokes the token if this panel ever unmounts while connected. It
  // never unmounts in the current app shell (always rendered in the
  // header), so this is a latent-only safety net.
  useEffect(() => {
    return () => providerRef.current.disconnect()
  }, [])

  // Silently resumes a Drive connection on mount, so Ctrl+S/Cmd+S (and the
  // Sincronizar button) work without a fresh "Conectar com Google" click on
  // every page load — the access token itself is memory-only by design (see
  // docs/data-and-privacy.md) and never survives a reload, so this is the
  // silent-reauth path, not a persisted-credential one. `reconnectSilently`
  // itself no-ops (no Google request at all) unless this browser connected
  // before. Deliberately does NOT run a sync afterwards — making Ctrl+S
  // itself instant is the goal, not a surprise network round-trip at
  // startup.
  //
  // `attemptedRef` makes this "retry once, the first time isOnline is true"
  // rather than "only ever check at the very first render": the app opening
  // while briefly offline (a captive portal, a flaky connection at boot)
  // would otherwise skip the attempt forever, since a plain `[]`-deps effect
  // never re-runs once connectivity returns. Once an attempt has actually
  // been made, it never retries again on later online/offline flips within
  // the same page load — a dropped-then-restored connection mid-session
  // isn't a new "first load", and reconnectSilently's own internal state
  // (connectionEpoch) already means a stale attempt can't resurrect a
  // connection anyway.
  const reconnectAttemptedRef = useRef(false)
  useEffect(() => {
    if (reconnectAttemptedRef.current) return
    if (!providerRef.current.isConfigured() || !isOnline) return
    reconnectAttemptedRef.current = true
    void providerRef.current.reconnectSilently()
  }, [isOnline])

  // "Fire an event" signal from src/app/ — see actionSignal's doc comment.
  // `nonce` alone drives the deps array (not `action`), so two same-action
  // requests in a row are each observed. `configured`/`connected`/
  // `handleSync` are deliberately NOT tracked as dependencies and are read
  // fresh via closure from whichever render last changed `nonce` — if they
  // were tracked, this would re-fire (and re-sync) merely because e.g.
  // `connected` flipped from a manual Connect click, with no new keypress
  // or menu click at all.
  useEffect(() => {
    if (actionSignal === undefined) return
    if (actionSignal.action === 'open') {
      setOpen(true)
      return
    }
    if (!configured || !connected) {
      // Explains itself instead of silently doing nothing — the shortcut
      // still "did something" from the user's point of view.
      setOpen(true)
      showToast(driveSyncCopy.syncNeedsConnectionToast, 'warning')
      return
    }
    void handleSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSignal?.nonce])

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
  //
  // `syncInFlightRef` is checked/set here, not in `handleSync` — this is
  // the actual shared entry point for every pull→reconcile→push caller
  // (both `handleSync` and `handleConnect`'s own post-connect sync below),
  // so no caller can start an overlapping sequence, not just the ones that
  // remember to check a guard themselves.
  async function performSync({ silentSuccess = false } = {}) {
    if (syncInFlightRef.current) return
    syncInFlightRef.current = true
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
    } finally {
      syncInFlightRef.current = false
    }
  }

  // Manual "Sincronizar" button handler: wraps performSync with the
  // online-precheck and the busy state (the button is already
  // `disabled={busy}`, but the Ctrl+S/Cmd+S shortcut's `actionSignal`
  // effect above calls this directly, bypassing that disabled attribute).
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
          title={driveSyncCopy.syncShortcutHint}
          ariaHasPopup="dialog"
          onClick={() => setOpen(true)}
        />
        {!isOnline && (
          <span class={styles.offlineBadge} role="status" title={driveSyncCopy.offlineBadgeTitle}>
            <span class="visually-hidden">{driveSyncCopy.offlineBadgeLabel}</span>
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
          <p class={styles.appVersion}>{`Versão ${appVersion}`}</p>
        </div>
      </Modal>
    </>
  )
}
