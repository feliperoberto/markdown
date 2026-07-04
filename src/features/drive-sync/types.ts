/**
 * Sync-provider boundary (issue #21).
 *
 * Google Drive is one *pluggable* implementation of this interface — the
 * rest of the app should only ever depend on `SyncProvider`, never on
 * Drive-specific APIs directly. This keeps the door open for other
 * backends (Dropbox, a self-hosted sync server, etc.) without touching
 * callers.
 */

/** Snapshot of local data a provider needs in order to sync it remotely. */
export interface ProjectsSnapshot {
  /** Arbitrary JSON-serializable project data, keyed by project name. */
  projects: Record<string, unknown>
}

export interface SyncStatus {
  /** Whether the provider currently holds a valid session/token. */
  connected: boolean
  /** Epoch ms of the last successful sync, or null if never synced. */
  lastSyncedAt: number | null
}

/**
 * Contract every sync backend must implement.
 *
 * Implementations are expected to:
 * - Keep any access/session token in memory only (never persisted to
 *   `localStorage`, `sessionStorage`, cookies, etc.) unless the provider
 *   explicitly documents otherwise.
 * - Be safe to call `sync()` repeatedly/periodically (idempotent, cheap
 *   no-op when there is nothing new to push).
 */
export interface SyncProvider {
  /** Whether the provider has enough configuration to attempt a connect. */
  isConfigured(): boolean

  /** Current connection/sync status, for UI display. */
  getStatus(): SyncStatus

  /** Starts the auth/connect flow (e.g. OAuth). Resolves once connected. */
  connect(): Promise<void>

  /** Pushes the given snapshot to the remote backend, if due/needed. */
  sync(snapshot: ProjectsSnapshot): Promise<void>

  /** Tears down the session (revokes tokens, stops polling, clears memory). */
  disconnect(): void
}
