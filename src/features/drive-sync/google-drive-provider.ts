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
 * `expires_in`, and proactively re-requests a token via silent re-auth when
 * near expiry, rather than letting a Drive API call fail opaquely mid-session.
 *
 * Security property preserved: the Drive access token (`this.accessToken`)
 * lives only as an in-memory instance field. It is never written to
 * `localStorage`, `sessionStorage`, or any other persistent store. Only
 * the (non-secret) OAuth Client ID is persisted, via `config.ts`.
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
    await this.fetchDriveUser()
    this.options.onStatusChange?.('connected')
    this.options.onNotify?.('✅ Drive conectado', 'success')
  }

  /**
   * Requests (or silently re-requests, if the user already has an active
   * Google session) an access token via GIS, and records its expiry so
   * `ensureFreshAccessToken` can proactively refresh it later.
   *
   * `epoch` pins this call to the connection generation active when it
   * started (see `connectionEpoch`); if `disconnect()`/another `connect()`
   * ran before this resolves, the result is discarded instead of silently
   * resurrecting a connection the user already ended. `notifyOnError`
   * controls whether an auth failure surfaces a user-facing toast — true
   * for an explicit `connect()` click, false for a silent token refresh
   * ahead of a push()/pull() call, where a scary "Erro ao conectar" toast
   * would be misleading (the caller's own error handling covers that case
   * instead).
   */
  private async acquireAccessToken(
    clientId: string,
    { epoch, notifyOnError = true }: { epoch: number; notifyOnError?: boolean },
  ): Promise<void> {
    const google = await loadGoogleIdentity()

    const response = await new Promise<GoogleTokenResponse>((resolve) => {
      const client: GoogleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: resolve,
      })
      client.requestAccessToken()
    })

    if (response.error || !response.access_token) {
      console.error('Drive auth error:', response)
      if (notifyOnError) {
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
   * re-requests a fresh one (GIS resolves this silently when the user still
   * has an active Google session, so no visible re-auth prompt is shown in
   * the common case) instead of letting the upcoming fetch fail with an
   * opaque 401 mid-session.
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
      await Promise.race([
        this.acquireAccessToken(this.tokenClientId, { epoch, notifyOnError: false }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Drive silent token refresh timed out')), 15_000),
        ),
      ])
    } catch (err) {
      // Leave the (soon-to-expire) token in place — the caller's Drive
      // request may still succeed, and if not, its own error handling will
      // surface a clear "sync failed" message rather than us throwing here.
      console.error('Drive silent token refresh failed:', err)
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
