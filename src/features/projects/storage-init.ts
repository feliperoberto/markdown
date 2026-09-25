import { openIndexedDbStore, type AsyncKeyValueStore } from '@/lib/idb-kv'
import { createMirroredStorageAdapter } from '@/lib/mirrored-storage-adapter'
import {
  createMemoryStorageAdapter,
  localStorageAdapter,
  type StorageAdapter,
} from '@/lib/storage-adapter'
import { mergeProjectsByFreshness } from './model'
import {
  backupProjects,
  configureProjectsStorage,
  INDEXED_DB_MAX_BACKUPS,
  LOCAL_STORAGE_MAX_BACKUPS,
  loadTombstones,
  parseProjectsBlob,
  projectsStorageKeys,
  pruneExcessBackups,
  saveProjects,
} from './storage'

// Boot-time selection of where the projects blob and its backups live
// (issue #120, ADR-0005). Must resolve before the app renders, because
// useProjects reads the blob synchronously on its first render.
//
//   1. Open IndexedDB and read the whole store into memory.
//   2. First run on an IndexedDB-capable build: copy the localStorage blob
//      and its backups over in ONE transaction, and only after it commits,
//      drop them from localStorage — that deletion is what actually frees
//      the ~5 MiB quota. A crash anywhere before the commit leaves the
//      localStorage copy authoritative and the import simply re-runs.
//   3. Serve all later reads/writes from an in-memory mirror with
//      write-behind to IndexedDB (mirrored-storage-adapter.ts), so every
//      caller keeps the synchronous StorageAdapter contract.
//
// Fallbacks, chosen so no path can lose or shadow stored data:
//   - IndexedDB unavailable and never used here → stay on localStorage
//     exactly as before, with the tight backup cap.
//   - IndexedDB unavailable but the marker says the data already moved
//     there → in-memory only. Falling back to localStorage would present
//     an empty/seeded state and later writes there would compete with the
//     real data on the next successful boot.

export type ProjectsStorageBackend = 'indexeddb' | 'localstorage' | 'memory'

// Kept in localStorage (small, synchronous, readable even when IndexedDB
// isn't): records that the projects blob has moved to IndexedDB.
const BACKEND_MARKER_KEY = 'projectsBackend'
const DB_NAME = 'markdown'
const STORE_NAME = 'kv'
const OPEN_TIMEOUT_MS = 5000

let activeBackend: ProjectsStorageBackend = 'localstorage'
const writeErrorListeners = new Set<(error: unknown) => void>()

export function getProjectsStorageBackend(): ProjectsStorageBackend {
  return activeBackend
}

/**
 * Subscribes to asynchronous write failures of the IndexedDB backend (the
 * synchronous localStorage backend reports failures by throwing from
 * saveProjects instead). Returns the unsubscribe function.
 */
export function onProjectsWriteError(listener: (error: unknown) => void): () => void {
  writeErrorListeners.add(listener)
  return () => writeErrorListeners.delete(listener)
}

function reportWriteError(error: unknown): void {
  console.error('Failed to persist projects to IndexedDB.', error)
  for (const listener of writeErrorListeners) listener(error)
}

export interface InitProjectsStorageOptions {
  /** Injected for tests; defaults to the real IndexedDB store. */
  openStore?: () => Promise<AsyncKeyValueStore>
  /** Injected for tests; defaults to `localStorageAdapter`. */
  legacy?: StorageAdapter
}

function safeGet(adapter: StorageAdapter, key: string): string | null {
  try {
    return adapter.get(key)
  } catch {
    return null
  }
}

function fallBackToLocalStorage(legacy: StorageAdapter): ProjectsStorageBackend {
  configureProjectsStorage(legacy, { maxBackups: LOCAL_STORAGE_MAX_BACKUPS })
  pruneExcessBackups(legacy)
  activeBackend = 'localstorage'
  return activeBackend
}

/** Never rejects: every failure resolves to one of the fallbacks above. */
export async function initProjectsStorage(
  options: InitProjectsStorageOptions = {},
): Promise<ProjectsStorageBackend> {
  const legacy = options.legacy ?? localStorageAdapter
  const openStore =
    options.openStore ??
    (() =>
      openIndexedDbStore({ dbName: DB_NAME, storeName: STORE_NAME, timeoutMs: OPEN_TIMEOUT_MS }))
  const alreadyMigrated = safeGet(legacy, BACKEND_MARKER_KEY) === 'indexeddb'
  const keys = projectsStorageKeys()

  let store: AsyncKeyValueStore
  let entries: Map<string, string>
  try {
    store = await openStore()
    entries = await store.getAll()
  } catch (error) {
    if (alreadyMigrated) {
      console.error(
        'Projects are stored in IndexedDB, which could not be opened; changes this session will not be saved.',
        error,
      )
      configureProjectsStorage(createMemoryStorageAdapter(), {
        maxBackups: INDEXED_DB_MAX_BACKUPS,
      })
      activeBackend = 'memory'
      return activeBackend
    }
    console.warn('IndexedDB unavailable; keeping projects in localStorage.', error)
    return fallBackToLocalStorage(legacy)
  }

  const legacyPrimary = safeGet(legacy, keys.primary)
  // Blob a pre-IndexedDB tab (ADR-0003: it may run indefinitely) wrote to
  // localStorage AFTER this origin migrated. Reconciled below.
  let staleLegacyPrimary: string | null = null

  if (legacyPrimary !== null && !entries.has(keys.primary)) {
    // Backups are compacted to slots 1..k (newest first, order kept) and
    // capped: slots beyond INDEXED_DB_MAX_BACKUPS are the oldest copies.
    const legacyBackups = keys.backups
      .map((key) => safeGet(legacy, key))
      .filter((value): value is string => value !== null)
      .slice(0, INDEXED_DB_MAX_BACKUPS)
    const batch: Array<[string, string]> = [[keys.primary, legacyPrimary]]
    legacyBackups.forEach((value, index) => batch.push([keys.backups[index]!, value]))
    try {
      await store.write(batch)
    } catch (error) {
      // localStorage still holds everything; retry the import next boot.
      console.warn('Failed to move projects into IndexedDB; keeping localStorage.', error)
      return fallBackToLocalStorage(legacy)
    }
    for (const [key, value] of batch) entries.set(key, value)
  } else if (legacyPrimary !== null) {
    staleLegacyPrimary = legacyPrimary
  }

  const adapter = createMirroredStorageAdapter(store, entries, reportWriteError)
  configureProjectsStorage(adapter, { maxBackups: INDEXED_DB_MAX_BACKUPS })
  pruneExcessBackups(adapter)

  let reconciled = true
  if (staleLegacyPrimary !== null) {
    const current = parseProjectsBlob(adapter.get(keys.primary)) ?? {}
    const stale = parseProjectsBlob(staleLegacyPrimary)
    if (stale) {
      // Same per-file freshness merge (newer timestamp wins, tombstoned
      // deletions stay deleted) Drive sync uses, so edits from either build
      // survive. Back up the IndexedDB side first, like any other merge.
      const { merged, localChanged } = mergeProjectsByFreshness(
        current,
        stale,
        loadTombstones(legacy),
      )
      if (localChanged) {
        backupProjects(current, adapter)
        saveProjects(merged, adapter)
        let failed = false
        const unsubscribe = onProjectsWriteError(() => (failed = true))
        await adapter.flush()
        unsubscribe()
        reconciled = !failed
      }
    }
  }

  // Only now is it safe to reclaim the localStorage copies: the IndexedDB
  // copy is committed (import) or has absorbed them (reconcile). If the
  // reconcile write failed, keep the stale blob so the next boot retries.
  // Removal first: on an origin that is at its quota, the marker write
  // below can only succeed once these copies are gone.
  try {
    if (reconciled) legacy.remove(keys.primary)
    for (const key of keys.backups) {
      if (legacy.get(key) !== null) legacy.remove(key)
    }
  } catch (error) {
    console.error('Failed to clean up legacy localStorage projects; continuing.', error)
  }
  try {
    legacy.set(BACKEND_MARKER_KEY, 'indexeddb')
  } catch (error) {
    console.error('Failed to record the IndexedDB storage marker; continuing.', error)
  }

  activeBackend = 'indexeddb'
  return activeBackend
}
