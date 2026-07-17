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
/**
 * Deliberately just download/upload primitives — no merge/conflict logic
 * here. Reconciling a pulled snapshot with local state needs to inspect
 * per-file freshness (a `projects`-feature concept: `ProjectFile.timestamp`),
 * and `src/features/*` may not import across features (see
 * `CONTRIBUTING.md`'s "Feature taxonomy"). That composition — pull, merge
 * by freshness, push — happens in `src/app/`, which is allowed to know
 * about both `drive-sync` and `projects`.
 */
export interface SyncProvider {
  /** Whether the provider has enough configuration to attempt a connect. */
  isConfigured(): boolean

  /** Current connection/sync status, for UI display. */
  getStatus(): SyncStatus

  /** Starts the auth/connect flow (e.g. OAuth). Resolves once connected. */
  connect(): Promise<void>

  /**
   * Downloads the current remote snapshot, or `null` if nothing has been
   * synced yet (an expected first-sync state, not an error).
   */
  pull(): Promise<ProjectsSnapshot | null>

  /** Uploads `snapshot`, replacing whatever is currently remote. */
  push(snapshot: ProjectsSnapshot): Promise<void>

  /** Tears down the session (revokes tokens, stops polling, clears memory). */
  disconnect(): void
}
