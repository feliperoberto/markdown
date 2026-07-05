/**
 * Google Drive implementation of `SyncProvider` (issue #21).
 *
 * Extracted from the original `index.html` inline script. The OAuth flow,
 * appDataFolder export/import calls, and the naive hash + 60s polling
 * auto-sync loop are preserved exactly as they behaved before — this is a
 * structural extraction only, not a rewrite of the sync algorithm.
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
import { loadGoogleIdentity, type GoogleTokenClient, type GoogleTokenResponse } from './google-identity'
import { driveSyncCopy } from './copy'

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
 * True when the runtime reports no network connectivity at all.
 *
 * Note: this is a second, independent connectivity signal from
 * `useOnlineStatus()` (used elsewhere in the UI, e.g. `DriveSyncPanel`'s
 * offline badge). Both ultimately read `navigator.onLine`, but they are not
 * unified into one shared primitive, so they could in theory drift (e.g.
 * different re-render timing around 'online'/'offline' events). Left as-is
 * for now — unifying connectivity detection into one shared hook/module is
 * a separate follow-up, not a quick fix.
 */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Scope audit (issue #30): every Drive API call this provider makes
 * (`findDriveFile`, `uploadSnapshot`, `importFromDrive`) targets
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
const PROJECTS_LAST_MODIFIED_STORAGE_KEY = 'projectsLastModified'

/** Auto-sync poll interval — checked every minute, exactly as before. */
const AUTO_SYNC_POLL_INTERVAL_MS = 60 * 1000
/** Force a sync if this much time has passed, regardless of local changes. */
const AUTO_SYNC_MAX_STALE_MS = 10 * 60 * 1000
/** If local data changed, still wait at least this long before re-syncing. */
const AUTO_SYNC_MIN_INTERVAL_AFTER_CHANGE_MS = 5 * 60 * 1000

export type DriveSyncDotStatus =
  | 'offline'
  | 'connected'
  | 'connected-offline'
  | 'syncing'
  | 'error'

export interface GoogleDriveSyncProviderOptions {
  /** Called whenever the connection/sync visual state changes (for a status dot, etc). */
  onStatusChange?: (status: DriveSyncDotStatus) => void
  /** Called with a human-readable name/email once available after connect. */
  onUserResolved?: (user: string) => void
  /** Called on notable events the UI may want to surface as a toast. */
  onNotify?: (message: string, kind: 'success' | 'error' | 'warning') => void
}

/**
 * Naive content hash used purely to detect "did the local data change"
 * between polling ticks. Preserved byte-for-byte from the original
 * implementation — do not "fix" this into something cryptographically
 * meaningful, that is explicitly a separate future task.
 */
function naiveHash(value: string): string {
  return value
    .split('')
    .reduce((hash, char) => (((hash << 5) - hash) + char.charCodeAt(0)) | 0, 0)
    .toString()
}

export class GoogleDriveSyncProvider implements SyncProvider {
  private accessToken: string | null = null
  private driveFileId: string | null = null
  private driveUser: string | null = null
  private autoSyncIntervalId: ReturnType<typeof setInterval> | null = null
  /** Epoch ms when `this.accessToken` is expected to expire, per `expires_in`. */
  private tokenExpiresAt: number | null = null
  /** Client ID used to acquire the current token — reused for silent re-auth. */
  private tokenClientId: string | null = null

  constructor(private readonly options: GoogleDriveSyncProviderOptions = {}) {}

  isConfigured(): boolean {
    return isClientIdConfigured(getStoredClientId())
  }

  getStatus(): SyncStatus {
    const lastSync = localStorage.getItem(LAST_SYNC_STORAGE_KEY)
    return {
      connected: this.accessToken !== null,
      lastSyncedAt: lastSync ? parseInt(lastSync, 10) : null,
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

    this.tokenClientId = clientId
    await this.acquireAccessToken(clientId)
    await this.fetchDriveUser()
    this.options.onStatusChange?.('connected')
    this.options.onNotify?.('✅ Drive conectado', 'success')
  }

  /**
   * Requests (or silently re-requests, if the user already has an active
   * Google session) an access token via GIS, and records its expiry so
   * `ensureFreshAccessToken` can proactively refresh it later.
   */
  private async acquireAccessToken(clientId: string): Promise<void> {
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
      this.options.onNotify?.('Erro ao conectar: ' + response.error, 'error')
      throw new Error(response.error || 'Drive auth failed')
    }

    this.accessToken = response.access_token
    this.tokenExpiresAt = typeof response.expires_in === 'number'
      ? Date.now() + response.expires_in * 1000
      : null
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

    try {
      await this.acquireAccessToken(this.tokenClientId)
    } catch (err) {
      // Leave the (soon-to-expire) token in place — the caller's Drive
      // request may still succeed, and if not, its own error handling will
      // surface a clear "sync failed" message rather than us throwing here.
      console.error('Drive silent token refresh failed:', err)
    }
  }

  disconnect(): void {
    if (this.accessToken) {
      const tokenToRevoke = this.accessToken
      loadGoogleIdentity()
        .then((google) => google.accounts.oauth2.revoke(tokenToRevoke, () => {}))
        .catch(() => {})
    }
    this.stopAutoSync()
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

  private async findDriveFile(): Promise<{ id: string; name: string; modifiedTime: string } | null> {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${DRIVE_FILENAME}'&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } },
    )
    const data = await res.json()
    if (data.files && data.files.length > 0) {
      this.driveFileId = data.files[0].id
      return data.files[0]
    }
    return null
  }

  private async uploadSnapshot(snapshot: ProjectsSnapshot): Promise<void> {
    const payload = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        projects: snapshot.projects,
      },
      null,
      2,
    )
    const blob = new Blob([payload], { type: 'application/json' })

    const existing = await this.findDriveFile()

    let res: Response
    if (existing) {
      res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${this.driveFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: blob,
      })
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
      const err = await res.json()
      throw new Error(err.error?.message || res.statusText)
    }

    const result = await res.json()
    this.driveFileId = result.id
  }

  /** Manual, immediate export ("Salvar no Drive" button). */
  async exportToDrive(snapshot: ProjectsSnapshot): Promise<void> {
    if (!this.accessToken) return

    // Offline: skip the network attempt entirely and surface a graceful
    // "will retry" state instead of a raw fetch/TypeError (issue #24). Local
    // data is untouched — projects are already saved to localStorage
    // independently of Drive sync.
    if (isOffline()) {
      // Distinct from the never-connected 'offline' status: the access
      // token is still valid, only the network is down (see finding #1) —
      // the panel should keep showing this as "connected", not revert to
      // "Conectar".
      this.options.onStatusChange?.('connected-offline')
      this.options.onNotify?.(driveSyncCopy.offlineWillRetrySync, 'warning')
      throw new DriveSyncOfflineError()
    }

    try {
      await this.ensureFreshAccessToken()
      this.options.onNotify?.('Salvando no Drive…', 'success')
      await this.uploadSnapshot(snapshot)
      this.options.onNotify?.('☁️ Salvo no Drive', 'success')
    } catch (err) {
      console.error('Drive export error:', err)
      this.options.onNotify?.('Erro ao salvar: ' + (err as Error).message, 'error')
      throw err
    }
  }

  /**
   * Restores projects from the Drive appDataFolder backup. Not part of the
   * `SyncProvider` interface (import/export UX is issue #20's concern) —
   * exposed here as a Drive-specific capability the projects feature may
   * opt into.
   */
  async importFromDrive(): Promise<Record<string, unknown>> {
    if (!this.accessToken) throw new Error('Not connected to Drive')

    await this.ensureFreshAccessToken()
    this.options.onNotify?.('Restaurando do Drive…', 'success')
    const existing = await this.findDriveFile()

    if (!existing) {
      this.options.onNotify?.('Nenhum backup encontrado', 'warning')
      throw new Error('No Drive backup found')
    }

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${this.driveFileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error?.message || res.statusText)
    }

    const data = await res.json()
    if (!data.projects) throw new Error('Formato de backup inválido')

    return data.projects
  }

  /**
   * Sync entrypoint required by `SyncProvider`. Performs an immediate,
   * unconditional export — the same operation as the manual "Sincronizar
   * Agora" button in the original UI. Use `startAutoSync` for the
   * background polling behavior.
   */
  async sync(snapshot: ProjectsSnapshot): Promise<void> {
    if (!this.accessToken) return

    try {
      await this.exportToDrive(snapshot)
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, Date.now().toString())
    } catch (err) {
      if (err instanceof DriveSyncOfflineError) {
        // Already surfaced as a graceful "offline, will retry" toast by
        // exportToDrive — avoid piling a second, more alarming error toast
        // on top of it.
        throw err
      }
      console.error('Sync error:', err)
      this.options.onNotify?.('Falha ao sincronizar com o Drive: ' + (err as Error).message, 'error')
      throw err
    }
  }

  /**
   * Naive hash + polling auto-sync loop, preserved as-is from the
   * original implementation:
   * - Checks every 60s.
   * - Forces a sync if it's been >10 min since the last one.
   * - Otherwise syncs if the content hash changed AND >5 min elapsed.
   */
  startAutoSync(getSnapshot: () => ProjectsSnapshot): void {
    this.stopAutoSync()

    this.autoSyncIntervalId = setInterval(() => {
      void this.runAutoSyncTick(getSnapshot)
    }, AUTO_SYNC_POLL_INTERVAL_MS)
  }

  stopAutoSync(): void {
    if (this.autoSyncIntervalId) {
      clearInterval(this.autoSyncIntervalId)
      this.autoSyncIntervalId = null
    }
  }

  private async runAutoSyncTick(getSnapshot: () => ProjectsSnapshot): Promise<void> {
    if (!this.accessToken) return

    const snapshot = getSnapshot()
    const currentHash = naiveHash(JSON.stringify(snapshot.projects))

    const lastSync = parseInt(localStorage.getItem(LAST_SYNC_STORAGE_KEY) || '0', 10)
    const lastModifiedHash = localStorage.getItem(PROJECTS_LAST_MODIFIED_STORAGE_KEY) || '0'
    const now = Date.now()
    const timeSinceSync = now - lastSync

    const isStale = timeSinceSync > AUTO_SYNC_MAX_STALE_MS
    const hasChangedRecently =
      currentHash !== lastModifiedHash && timeSinceSync > AUTO_SYNC_MIN_INTERVAL_AFTER_CHANGE_MS

    if (!isStale && !hasChangedRecently) return

    // Offline: skip this tick's network attempt entirely rather than
    // letting a fetch/TypeError land in the console as an 'error' status
    // (issue #24). The interval keeps running, so the next tick after
    // connectivity returns will pick this back up automatically.
    if (isOffline()) {
      // Same distinction as exportToDrive above (finding #1): still
      // authenticated, just no network right now.
      this.options.onStatusChange?.('connected-offline')
      return
    }

    try {
      await this.ensureFreshAccessToken()
      await this.uploadSnapshot(snapshot)
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, Date.now().toString())
      localStorage.setItem(PROJECTS_LAST_MODIFIED_STORAGE_KEY, currentHash)
      this.options.onStatusChange?.('connected')
      // Silent success - no toast, matching the original behavior.
    } catch (err) {
      console.error('Auto-sync error:', err)
      this.options.onStatusChange?.('error')
    }
  }
}
