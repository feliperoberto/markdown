import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useToast } from '@/components'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { DriveSyncOfflineError, GoogleDriveSyncProvider } from './google-drive-provider'
import type { DriveSyncDotStatus } from './google-drive-provider'
import { driveSyncCopy } from './copy'
import {
  clearStoredClientId,
  getStoredClientId,
  isClientIdConfigured,
  setStoredClientId,
} from './config'
import type { ProjectsSnapshot } from './types'

export interface UseDriveSyncOptions {
  /**
   * Reconciles a just-pulled remote snapshot (`null` if nothing has been
   * synced yet) with local state by per-file freshness — applies the
   * merged result to local state and returns it, so it can also be pushed
   * back to Drive. Injected from `src/app/`: this hook only ever sees the
   * opaque `ProjectsSnapshot` shape, never the `projects`-feature's
   * concrete types (see `SyncProvider`'s doc comment on why the merge
   * logic itself can't live in this feature).
   */
  reconcile: (remote: ProjectsSnapshot | null) => ProjectsSnapshot
}

export interface UseDriveSyncResult {
  /** Raw connection/sync status, mostly useful for a status dot. */
  status: DriveSyncDotStatus
  /**
   * 'connected-offline' (authenticated but currently offline) counts as
   * connected too — keeps the Sync/Disconnect UI visible rather than
   * falling back to the never-connected 'offline' state.
   */
  connected: boolean
  userName: string | null
  /** True while a connect or sync request is in flight. */
  busy: boolean
  isOnline: boolean
  lastSyncedAt: number | null
  /** Whether a real (non-empty, non-placeholder) Client ID is stored. */
  configured: boolean
  /**
   * True whenever an action that needs a working Drive connection
   * (clicking the cloud icon, Ctrl+S/Cmd+S) should open the config modal
   * instead of attempting to sync — i.e. `!configured || !connected`.
   * Centralized here, rather than left for each caller to re-derive its
   * own `!configured || !connected` check, so the cloud-icon click handler
   * (`app.tsx`) and the Ctrl+S handler (`DriveSyncPanel`) can never
   * silently disagree about when to sync vs. when to redirect to config.
   */
  needsConfig: boolean
  /** The persisted Client ID, for seeding the config form's initial value. */
  storedClientId: string
  connect: () => Promise<void>
  disconnect: () => void
  /** Manual pull → reconcile → push, gated on `busy`/online precheck. */
  sync: () => Promise<void>
  /** Validates, persists, and reflects a new Client ID; returns whether it was accepted. */
  saveClientId: (value: string) => boolean
  clearClientId: () => void
}

/**
 * Owns the single `GoogleDriveSyncProvider` instance and all Drive
 * connection/sync/config state for the app (issue #110). Called exactly
 * once, from `src/app/app.tsx`, and its result is threaded as props into
 * both `DriveSyncPanel` (sync-focused: cloud header button) and
 * `DriveConfigPanel` (config-focused: sidebar gear button) — one shared
 * source of truth instead of two panels each owning a partial, possibly
 * stale copy.
 */
export function useDriveSync({ reconcile }: UseDriveSyncOptions): UseDriveSyncResult {
  const showToast = useToast()
  const [status, setStatus] = useState<DriveSyncDotStatus>('offline')
  const [user, setUser] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isOnline = useOnlineStatus()
  const [storedClientId, setStoredClientIdState] = useState(() => getStoredClientId())

  // Always dereferenced fresh from the provider's onNotify callback, so
  // showToast's identity never needs to be a useMemo dependency below —
  // the provider below is created exactly once (empty deps) and should
  // stay that way, since a rebuild mid-session would orphan the OLD
  // instance's in-memory accessToken/connection state with no way to
  // disconnect it from the UI (providerRef would only ever point at the
  // new instance).
  const showToastRef = useRef(showToast)
  showToastRef.current = showToast

  // Created exactly once for the hook's lifetime — no dependency that
  // could ever cause a rebuild.
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
  // shortcut press landing while the connect-time sync (connect's own
  // performSync call, below) is still in flight. `busy` (state) isn't
  // enough on its own: a call dispatched before React/Preact has committed
  // a previous `setBusy(true)` could still read the old `busy` value and
  // pass the check. A ref is updated synchronously, so a second call sees
  // the first one's guard immediately, with no render in between. Lives on
  // `performSync` itself (the one shared entry point every caller funnels
  // through — sync AND connect) rather than on any individual caller, so
  // no future caller can bypass it by forgetting to check it.
  const syncInFlightRef = useRef(false)

  // Revokes the token if this hook ever unmounts while connected. It never
  // unmounts in the current app shell (always alive at the top of
  // `src/app/app.tsx`), so this is a latent-only safety net.
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

  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(
    () => providerRef.current.getStatus().lastSyncedAt,
  )

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
  // `syncInFlightRef` is checked/set here, not in `sync` — this is the
  // actual shared entry point for every pull→reconcile→push caller (both
  // `sync` and `connect`'s own post-connect sync below), so no caller can
  // start an overlapping sequence, not just the ones that remember to
  // check a guard themselves.
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

  async function connect() {
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

  function disconnect() {
    providerRef.current.disconnect()
    setUser(null)
  }

  // Manual "Sincronizar" button handler: wraps performSync with the
  // online-precheck and the busy state (the button is already
  // `disabled={busy}`, but the Ctrl+S/Cmd+S shortcut bypasses that
  // disabled attribute by calling this directly).
  async function sync() {
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

  // Both persist to localStorage AND update this hook's own reactive
  // `storedClientId` state — the actual fix for the stale-config bug: a
  // caller reading `configured` (e.g. DriveSyncPanel, rendered
  // concurrently with DriveConfigPanel) sees the change the moment it
  // happens, not only after its own next mount.
  function saveClientId(value: string): boolean {
    const trimmed = value.trim()
    if (!trimmed) {
      // Prototype parity: an empty/whitespace Client ID was rejected
      // rather than silently persisted with a success toast, which left
      // Connect disabled with no explanation of why.
      showToast(driveSyncCopy.clientIdEmptyWarning, 'warning')
      return false
    }
    setStoredClientId(trimmed)
    setStoredClientIdState(trimmed)
    showToast(driveSyncCopy.clientIdSavedToast, 'success')
    return true
  }

  function clearClientId() {
    clearStoredClientId()
    setStoredClientIdState(getStoredClientId())
    showToast(driveSyncCopy.clientIdClearedToast, 'success')
  }

  // 'connected-offline' means "authenticated but currently offline" — keep
  // treating it as connected (the Sync/Disconnect UI stays visible) rather
  // than falling back to the never-connected 'offline' state.
  const connected = status === 'connected' || status === 'syncing' || status === 'connected-offline'
  const configured = isClientIdConfigured(storedClientId)

  return {
    status,
    connected,
    userName: user,
    busy,
    isOnline,
    lastSyncedAt,
    configured,
    needsConfig: !configured || !connected,
    storedClientId,
    connect,
    disconnect,
    sync,
    saveClientId,
    clearClientId,
  }
}
