/**
 * Google Drive implementation of `SyncProvider` (issue #21).
 *
 * Extracted from the original `index.html` inline script. What sync
 * actually *does* has since changed: instead of blindly overwriting one
 * side with the other (push-only "Sincronizar Agora", local-always-wins
 * "Restaurar do Drive"), `pull`/`push` are dumb download/upload primitives
 * and the actual sync decision — a freshness merge keyed on each file's
 * `timestamp` — is injected from `src/app/` (see `SyncProvider`'s doc
 * comment for why that logic can't live here). Sync only ever runs from an
 * explicit user action (connect, or the "Sincronizar" button) — the
 * original naive-hash + 60s background polling loop that used to trigger it
 * automatically was removed (issue #92: its periodic token re-request popped
 * a Google auth window that stole focus from the editor mid-typing).
 * Token-expiry/refresh hardening (issue #30) tracks acquisition time +
 * `expires_in`, and proactively re-requests a token near expiry, rather than
 * letting a Drive API call fail opaquely mid-session. That refresh (and
 * `reconnectSilently`'s mount-time reconnect) requests the token with
 * `prompt: ''` (see `google-identity.ts`), which is what actually makes it
 * silent — omitting `prompt` (GIS's default) shows the account picker and
 * consent screen on every acquisition, which previously made routine sync
 * feel like it was re-authenticating almost every time it ran.
 *
 * Security property preserved: the Drive access token (`this.accessToken`)
 * lives only as an in-memory instance field. It is never written to
 * `localStorage`, `sessionStorage`, or any other persistent store — it does
 * not survive a reload, silent reconnect or not. Only non-secret data is
 * persisted: the OAuth Client ID (`config.ts`), and a boolean hint that this
 * browser has connected before (`AUTO_RECONNECT_STORAGE_KEY`, below) used
 * only to decide whether attempting a silent reconnect on mount is worth
 * it — see `docs/data-and-privacy.md`.
 */
import type { ProjectsSnapshot, SyncProvider, SyncStatus } from './types'
import {
  getStoredClientId,
  isClientIdConfigured,
  isPlaceholderClientId,
  setStoredClientId,
} from './config'
import {
  loadGoogleIdentity,
  type GoogleTokenClient,
  type GoogleTokenResponse,
} from './google-identity'
import { driveSyncCopy } from './copy'
import { localStorageAdapter } from '@/lib/storage-adapter'
import { isNavigatorOnline } from '@/lib/useOnlineStatus'

/**
 * Thrown (instead of letting a raw fetch/TypeError bubble up) when a sync
 * attempt is skipped because the browser is offline (issue #24). Kept as a
 * distinct class so callers can special-case it without string-matching on
 * error messages.
 */
export class DriveSyncOfflineError extends Error {
  constructor() {
    super(driveSyncCopy.offlineWillRetrySync)
    this.name = 'DriveSyncOfflineError'
  }
}

/**
 * Scope audit (issue #30): every Drive API call this provider makes
 * (`findDriveFile`, `uploadSnapshot`, `pull`) targets
 * `spaces=appDataFolder` / `parents: ['appDataFolder']` exclusively — there
 * is no code path that reads or writes files outside the app-private
 * appDataFolder. `drive.file` (which would grant access to arbitrary
 * user-selected files across their whole Drive) is not needed and has been
 * removed; `drive.appdata` alone is sufficient and strictly narrower.
 */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const DRIVE_FILENAME = 'markdown-editor-backup.json'

/** Proactively refresh the token once this close to its stated expiry. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000

const LAST_SYNC_STORAGE_KEY = 'lastDriveSync'
/**
 * Non-secret hint ("this browser has connected to Drive before"), NOT a
 * credential — the access token itself stays memory-only (see
 * `docs/data-and-privacy.md`) and is lost on every reload regardless of
 * this flag. Read on mount to decide whether a silent reconnect attempt is
 * worth making at all; a browser that never connected has no active Google
 * session to reuse, so skipping the attempt there avoids a pointless GIS
 * round-trip.
 */
const AUTO_RECONNECT_STORAGE_KEY = 'driveAutoReconnect'

export type DriveSyncDotStatus = 'offline' | 'connected' | 'connected-offline' | 'syncing'

export interface GoogleDriveSyncProviderOptions {
  /** Called whenever the connection/sync visual state changes (for a status dot, etc). */
  onStatusChange?: (status: DriveSyncDotStatus) => void
  /** Called with a human-readable name/email once available after connect. */
  onUserResolved?: (user: string) => void
  /** Called on notable events the UI may want to surface as a toast. */
  onNotify?: (message: string, kind: 'success' | 'error' | 'warning') => void
}

export class GoogleDriveSyncProvider implements SyncProvider {
  private accessToken: string | null = null
  private driveFileId: string | null = null
  private driveUser: string | null = null
  /** Epoch ms when `this.accessToken` is expected to expire, per `expires_in`. */
  private tokenExpiresAt: number | null = null
  /** Client ID used to acquire the current token — reused for silent re-auth. */
  private tokenClientId: string | null = null
  /**
   * Bumped on every `connect()`/`disconnect()`. An in-flight
   * `acquireAccessToken` call captures the epoch at its start and only
   * applies its result if the epoch is still current — otherwise the user
   * disconnected (or reconnected) while the request was in flight, and a
   * stale token response must not resurrect a connection the user ended.
   */
  private connectionEpoch = 0

  constructor(private readonly options: GoogleDriveSyncProviderOptions = {}) {}

  isConfigured(): boolean {
    return isClientIdConfigured(getStoredClientId())
  }

  getStatus(): SyncStatus {
    const lastSync = localStorageAdapter.get(LAST_SYNC_STORAGE_KEY)
    const parsed = lastSync ? parseInt(lastSync, 10) : null
    return {
      connected: this.accessToken !== null,
      lastSyncedAt: parsed !== null && Number.isNaN(parsed) ? null : parsed,
    }
  }

  getUser(): string | null {
    return this.driveUser
  }

  /** Configures (and persists) the OAuth Client ID. Client ID is not a secret — see config.ts. */
  setClientId(clientId: string): void {
    setStoredClientId(clientId)
  }

  async connect(): Promise<void> {
    const clientId = getStoredClientId()
    if (isPlaceholderClientId(clientId)) {
      this.options.onNotify?.('Configure o CLIENT_ID no código', 'error')
      throw new Error('Drive Client ID is not configured')
    }

    const epoch = ++this.connectionEpoch
    await this.acquireAccessToken(clientId, { epoch })
    await this.finishConnecting(epoch, { notifySuccess: true })
  }

  /**
   * Attempts to silently resume a Drive connection on mount, without any
   * visible Google UI and without ever surfacing an error toast — a failed
   * attempt just leaves the app disconnected, exactly as if this had never
   * been called (recall issue #92: a background token request stealing
   * focus from the editor is the regression this must not reintroduce).
   * Skips the attempt entirely if this browser has never connected before
   * (see `AUTO_RECONNECT_STORAGE_KEY`) — there is no Google session to
   * silently reuse in that case, so it would just be a wasted round-trip.
   * Bounded by the same 15s timeout as `ensureFreshAccessToken`'s silent
   * refresh, so a GIS request that never invokes either callback (a
   * documented real-world quirk of `prompt: ''` acquisition) can't leave
   * this hanging forever on every page load.
   *
   * Returns whether it reconnected, so the caller can decide whether to
   * update its own status UI.
   */
  async reconnectSilently(): Promise<boolean> {
    if (localStorageAdapter.get(AUTO_RECONNECT_STORAGE_KEY) !== 'true') return false

    const clientId = getStoredClientId()
    if (!isClientIdConfigured(clientId)) return false

    const epoch = ++this.connectionEpoch
    try {
      await this.raceWithTimeout(
        this.acquireAccessToken(clientId, { epoch, notifyOnError: false, silent: true }),
        15_000,
        'Drive silent reconnect timed out',
      )
    } catch {
      return false
    }

    return this.finishConnecting(epoch, { notifySuccess: false })
  }

  /**
   * Shared tail of `connect()` and `reconnectSilently()`, run once
   * `acquireAccessToken` has already resolved for `epoch`. Rechecks
   * staleness AFTER `fetchDriveUser()` too, not just before it — a
   * `disconnect()` (or a newer `connect()`/`reconnectSilently()`) landing
   * during that network round-trip must not resurrect a connection that's
   * already been superseded, the same hazard `acquireAccessToken`'s own
   * epoch guard exists to prevent for the token-acquisition step itself.
   * `notifySuccess` gates the "✅ Drive conectado" toast — shown for an
   * explicit `connect()` click, never for a silent reconnect.
   */
  private async finishConnecting(
    epoch: number,
    { notifySuccess }: { notifySuccess: boolean },
  ): Promise<boolean> {
    if (epoch !== this.connectionEpoch || !this.accessToken) return false

    await this.fetchDriveUser()
    if (epoch !== this.connectionEpoch || !this.accessToken) return false

    localStorageAdapter.set(AUTO_RECONNECT_STORAGE_KEY, 'true')
    this.options.onStatusChange?.('connected')
    if (notifySuccess) {
      this.options.onNotify?.('✅ Drive conectado', 'success')
    }
    return true
  }

  /**
   * Races `promise` against a timeout — used for every silent (`prompt:
   * ''`) token request, none of which are backed by a user gesture, so
   * none can rely on a click handler's own timeout/cancellation. GIS can,
   * in some browser/session states, invoke neither `callback` nor
   * `error_callback` for a failed silent request, which would otherwise
   * hang the awaiting caller indefinitely.
   */
  private raceWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs),
      ),
    ])
  }

  /**
   * Requests an access token via GIS, and records its expiry so
   * `ensureFreshAccessToken` can proactively refresh it later.
   *
   * `epoch` pins this call to the connection generation active when it
   * started (see `connectionEpoch`); if `disconnect()`/another `connect()`
   * ran before this resolves, the result is discarded instead of silently
   * resurrecting a connection the user already ended. `notifyOnError`
   * controls whether an auth failure surfaces a user-facing toast — true
   * for an explicit `connect()` click, false for a silent token refresh
   * ahead of a push()/pull() call or `reconnectSilently()`'s own mount-time
   * attempt, where a scary "Erro ao conectar" toast would be misleading
   * (the caller's own error handling covers that case instead).
   *
   * `silent` passes `prompt: ''` to GIS, requesting a token with no visible
   * UI — this only succeeds if the user still has an active Google session
   * and has already granted consent for `DRIVE_SCOPE`; otherwise GIS
   * reports failure via `error_callback` (routed into the same
   * `GoogleTokenResponse` shape as an ordinary `callback` error) rather
   * than showing a popup. Used by `ensureFreshAccessToken` and
   * `reconnectSilently` — an explicit "Conectar com Google" click always
   * omits it, since a user who just clicked Connect expects the account
   * picker.
   */
  private async acquireAccessToken(
    clientId: string,
    {
      epoch,
      notifyOnError = true,
      silent = false,
    }: {
      epoch: number
      notifyOnError?: boolean
      silent?: boolean
    },
  ): Promise<void> {
    const google = await loadGoogleIdentity()

    const response = await new Promise<GoogleTokenResponse>((resolve) => {
      const client: GoogleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        ...(silent ? { prompt: '' } : {}),
        callback: resolve,
        error_callback: (error) =>
          resolve({ error: error.type || error.message || 'unknown_error' }),
      })
      client.requestAccessToken()
    })

    if (response.error || !response.access_token) {
      // 'popup_closed' means the user themselves closed the account-picker
      // popup — an ordinary cancellation, not a failure worth logging or
      // showing a scary "Erro ao conectar" toast for. Every other error
      // (bad client ID, blocked popup, no session to silently reuse, etc.)
      // still logs/notifies exactly as before, gated on `notifyOnError`.
      const isUserCancelled = response.error === 'popup_closed'
      if (notifyOnError && !isUserCancelled) {
        console.error('Drive auth error:', response)
        this.options.onNotify?.('Erro ao conectar: ' + response.error, 'error')
      }
      throw new Error(response.error || 'Drive auth failed')
    }

    if (epoch !== this.connectionEpoch) {
      // Stale: the user disconnected (or reconnected) while this request
      // was in flight. Discard the result rather than reviving a
      // connection that was explicitly ended.
      return
    }

    this.accessToken = response.access_token
    this.tokenClientId = clientId
    this.tokenExpiresAt =
      typeof response.expires_in === 'number' ? Date.now() + response.expires_in * 1000 : null
  }

  /**
   * Called before any Drive API request. If the current token is missing,
   * expired, or within `TOKEN_REFRESH_MARGIN_MS` of expiring, transparently
   * re-requests a fresh one with `prompt: ''` (silent — resolved without any
   * visible UI when the user still has an active Google session, so no
   * re-auth prompt interrupts routine sync) instead of letting the upcoming
   * fetch fail with an opaque 401 mid-session.
   *
   * A silent-only refresh has no interactive fallback: if the user's Google
   * session has genuinely expired or consent was revoked, GIS reports that
   * via `error_callback` rather than ever succeeding. When that happens
   * (as opposed to merely timing out, which may still resolve next time),
   * the stale token is cleared and status flips to 'offline' — otherwise
   * the panel would keep claiming "Conectado" with a "Desconectar" button
   * while every sync silently fails, forcing the user to disconnect before
   * they can even see a "Conectar" button to try again.
   */
  private async ensureFreshAccessToken(): Promise<void> {
    if (!this.accessToken || !this.tokenClientId) return

    const isNearExpiry =
      this.tokenExpiresAt !== null && Date.now() >= this.tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS

    if (!isNearExpiry) return

    const epoch = this.connectionEpoch
    try {
      // Bounded so a background refresh (no user gesture backing the GIS
      // request — this can run ahead of any push()/pull() call) can't hang
      // the caller indefinitely if the browser silently blocks/never
      // resolves an interactive consent popup here.
      await this.raceWithTimeout(
        this.acquireAccessToken(this.tokenClientId, { epoch, notifyOnError: false, silent: true }),
        15_000,
        'Drive silent token refresh timed out',
      )
    } catch (err) {
      console.error('Drive silent token refresh failed:', err)

      const isTimeout =
        err instanceof Error && err.message === 'Drive silent token refresh timed out'
      if (!isTimeout && epoch === this.connectionEpoch) {
        // A genuine GIS-reported failure, not a transient timeout that
        // might still succeed next call — the stale token is not going to
        // start working. Only clear it if this is still the current
        // connection generation; a stale epoch means the user already
        // disconnected/reconnected, whose own state changes must win.
        this.accessToken = null
        this.tokenExpiresAt = null
        this.tokenClientId = null
        this.driveUser = null
        this.options.onStatusChange?.('offline')
      }
    }
  }

  disconnect(): void {
    this.connectionEpoch++
    if (this.accessToken) {
      const tokenToRevoke = this.accessToken
      loadGoogleIdentity()
        .then((google) => google.accounts.oauth2.revoke(tokenToRevoke, () => {}))
        .catch(() => {})
    }
    this.accessToken = null
    this.tokenExpiresAt = null
    this.tokenClientId = null
    this.driveUser = null
    this.driveFileId = null
    localStorageAdapter.remove(AUTO_RECONNECT_STORAGE_KEY)
    this.options.onStatusChange?.('offline')
    this.options.onNotify?.('Desconectado do Drive', 'success')
  }

  private async fetchDriveUser(): Promise<void> {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      })
      const data = await res.json()
      this.driveUser = data.name || data.email || 'Usuário'
    } catch {
      this.driveUser = 'Usuário Google'
    }
    if (this.driveUser) {
      this.options.onUserResolved?.(this.driveUser)
    }
  }

  private async findDriveFile(): Promise<{
    id: string
    name: string
    modifiedTime: string
  } | null> {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${DRIVE_FILENAME}'&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } },
    )

    // A non-2xx response (transient rate-limit/5xx, not necessarily an
    // auth failure) previously fell through as if "no file exists" —
    // uploadSnapshot then took the create branch and POSTed a duplicate
    // backup instead of PATCHing the real one. Mirrors the res.ok guard
    // uploadSnapshot/pull already have; the error body may not
    // be valid JSON, so parsing it is best-effort.
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || res.statusText)
    }

    const data = await res.json()
    if (data.files && data.files.length > 0) {
      this.driveFileId = data.files[0].id
      return data.files[0]
    }
    return null
  }

  /**
   * Uploads `snapshot` to Drive and, on success, records `lastDriveSync`
   * here — the one place that actually knows the upload succeeded.
   */
  private async uploadSnapshot(snapshot: ProjectsSnapshot): Promise<void> {
    const payload = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        projects: snapshot.projects,
        // Optional field on an older backup this build reads back — see
        // ProjectsSnapshot's doc comment on why it's safe to omit/ignore.
        tombstones: snapshot.tombstones ?? {},
      },
      null,
      2,
    )
    const blob = new Blob([payload], { type: 'application/json' })

    const existing = await this.findDriveFile()

    let res: Response
    if (existing) {
      res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${this.driveFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: blob,
        },
      )
    } else {
      const metadata = { name: DRIVE_FILENAME, parents: ['appDataFolder'] }
      const form = new FormData()
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
      form.append('file', blob)

      res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.accessToken}` },
        body: form,
      })
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || res.statusText)
    }

    const result = await res.json()
    this.driveFileId = result.id

    localStorageAdapter.set(LAST_SYNC_STORAGE_KEY, Date.now().toString())
  }

  /**
   * Uploads `snapshot`, replacing whatever is currently remote. A pure
   * primitive — no toasts here; the manual "Sincronizar" flow
   * (`DriveSyncPanel.handleSync`) owns messaging for the whole
   * pull→reconcile→push sequence as one outcome.
   */
  async push(snapshot: ProjectsSnapshot): Promise<void> {
    if (!this.accessToken) return

    // Offline: skip the network attempt entirely and surface a graceful
    // "will retry" state instead of a raw fetch/TypeError (issue #24). Local
    // data is untouched — projects are already saved to localStorage
    // independently of Drive sync.
    if (!isNavigatorOnline()) {
      // Distinct from the never-connected 'offline' status: the access
      // token is still valid, only the network is down (see finding #1) —
      // the panel should keep showing this as "connected", not revert to
      // "Conectar".
      this.options.onStatusChange?.('connected-offline')
      throw new DriveSyncOfflineError()
    }

    await this.ensureFreshAccessToken()
    // ensureFreshAccessToken can now clear this.accessToken (a genuinely
    // failed silent refresh, not just a timeout — see its doc comment)
    // instead of always leaving the soon-to-expire token in place. Without
    // this re-check, uploadSnapshot would still fire with a null token,
    // producing a raw "Invalid Credentials" API error instead of the
    // silent no-op this method already uses for "not connected" above.
    if (!this.accessToken) return
    await this.uploadSnapshot(snapshot)
  }

  /**
   * Downloads the current remote snapshot from the Drive appDataFolder
   * backup, or `null` if nothing has been uploaded yet (an expected
   * first-sync state, not an error — the caller's reconcile+push resolves
   * it). Callers no longer get a standalone "restore" toast here; the
   * unified sync flow (`DriveSyncPanel.handleSync`) owns the user-facing
   * messaging for the whole pull→reconcile→push sequence.
   */
  async pull(): Promise<ProjectsSnapshot | null> {
    if (!this.accessToken) throw new Error('Not connected to Drive')

    await this.ensureFreshAccessToken()
    // See push()'s identical re-check: ensureFreshAccessToken can now clear
    // this.accessToken on a genuine (non-timeout) silent-refresh failure.
    if (!this.accessToken) throw new Error('Not connected to Drive')
    const existing = await this.findDriveFile()
    if (!existing) return null

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${this.driveFileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      },
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || res.statusText)
    }

    // A truncated/corrupted/hand-edited backup file is not valid JSON —
    // res.json() previously rejected uncaught with a raw SyntaxError
    // ("Unexpected token…") instead of the same clear
    // "Formato de backup inválido" message a missing `projects` field
    // already produces below.
    let data: { projects?: unknown; tombstones?: unknown }
    try {
      data = await res.json()
    } catch {
      throw new Error('Formato de backup inválido')
    }
    if (!data.projects) throw new Error('Formato de backup inválido')

    return {
      projects: data.projects as Record<string, unknown>,
      // Absent on a backup written before this field existed — the caller
      // (reconcileWithRemote) treats `undefined` the same as "nothing to
      // merge in", not an error.
      tombstones: data.tombstones as Record<string, unknown> | undefined,
    }
  }
}
