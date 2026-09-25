import { localStorageAdapter, type StorageAdapter } from '@/lib/storage-adapter'
import {
  CURRENT_SCHEMA_VERSION,
  isEnvelope,
  isFutureSchema,
  migrateStoredProjects,
  type StorageEnvelope,
} from '@/lib/storage-migrations'
import type { ProjectFile, ProjectsState } from './types'

const PROJECTS_STORAGE_KEY = 'projects'

// First-run seed, matching the prototype exactly (`defaultProject`/
// `defaultFile` in its init block) — a brand-new user with nothing
// stored got a starter project/file to type into immediately, rather
// than landing on an empty "Nenhum projeto ainda" sidebar with no
// obvious next action. Only fires when NOTHING is stored at all
// (`raw === null`, i.e. genuinely first-ever load) — a user who
// deliberately deleted every project should see the empty state they
// created, not have a new one silently seeded back in.
const DEFAULT_PROJECT_NAME = 'Meu Projeto'
const DEFAULT_FILE_NAME = 'Sem título'

function seedDefaultProjects(): ProjectsState {
  const file: ProjectFile = {
    name: DEFAULT_FILE_NAME,
    content: '',
    size: 0,
    timestamp: new Date().toISOString(),
  }
  return { [DEFAULT_PROJECT_NAME]: { [DEFAULT_FILE_NAME]: file } }
}

// Rotating backups, written as an independent safety net immediately
// before any destructive operation (bulk delete, ZIP import overwrite,
// restore-from-backup) — see `backupProjects` below. Capped so storage
// usage stays bounded; oldest backup is dropped once the cap is reached.
//
// Issue #120: every backup is a FULL copy of the projects blob, so the cap
// multiplies the footprint — 50 copies of a 100 KB blob alone exhausted
// localStorage's ~5 MiB per-origin quota, after which the primary
// `projects` write itself failed and the user could no longer edit. The
// cap is therefore per backend: tight on localStorage (backups must never
// crowd out the document they protect), roomier on IndexedDB, whose quota
// is a share of free disk. Still bounded there because rotation rewrites
// every slot, so each destructive op costs O(cap × blob) of writes.
const BACKUP_KEY_PREFIX = 'projects_backup_'
export const LOCAL_STORAGE_MAX_BACKUPS = 3
export const INDEXED_DB_MAX_BACKUPS = 10
// Highest backup index any shipped build ever wrote (#116 raised the cap to
// 50). Lowering the cap does NOT reclaim slots above it on its own —
// rotation only touches indices up to the current cap — so
// `pruneExcessBackups` sweeps up to this bound to delete the orphans.
export const LEGACY_MAX_BACKUPS = 50

// Which adapter the projects blob and its backups live in. Defaults to
// localStorage so tests and any code running before `initProjectsStorage`
// (storage-init.ts) keep the historical behavior; that bootstrap swaps in
// the IndexedDB-backed adapter once it's open. The small UI-state sidecars
// below deliberately always stay on `localStorageAdapter`: they're tiny,
// and keeping them synchronous and shared across builds is worth more than
// moving them.
let projectsAdapter: StorageAdapter = localStorageAdapter
let maxBackups = LOCAL_STORAGE_MAX_BACKUPS

export function configureProjectsStorage(
  adapter: StorageAdapter,
  options: { maxBackups: number },
): void {
  projectsAdapter = adapter
  maxBackups = options.maxBackups
}

/** Restores the localStorage defaults. Test-only escape hatch. */
export function resetProjectsStorage(): void {
  configureProjectsStorage(localStorageAdapter, { maxBackups: LOCAL_STORAGE_MAX_BACKUPS })
}

export function getProjectsAdapter(): StorageAdapter {
  return projectsAdapter
}

// UI-state persistence (issue #92: "memory"). Kept in localStorage next to
// the projects data but deliberately separate keys — losing/ignoring these
// never risks the actual documents, so reads are all best-effort and fall
// back to a neutral default rather than throwing.
const LAST_EDITED_FILE_KEY = 'lastEditedFile'
const COLLAPSED_PROJECTS_KEY = 'collapsedProjects'
// Archive feature: which projects are hidden from the everyday list.
// Deliberately the same sidecar-key pattern as COLLAPSED_PROJECTS_KEY, and
// deliberately NOT part of the `projects` envelope: it's device-local view
// state, never written into a Drive snapshot and never sent through
// mergeProjectsByFreshness (which resolves conflicts by file timestamp — a
// name set has none, so a cross-device merge could only union or
// last-writer-wins, either of which reads as "why did my archived project
// come back / vanish on my other device?"). A Drive pull can only ever ADD
// projects, and those always arrive unarchived — correct, since the set
// can't go stale from sync. If archiving ever needs to follow you across
// devices, that's a real schema change (per-project metadata with an
// `archivedAt`), not an extension of this key.
const ARCHIVED_PROJECTS_KEY = 'archivedProjects'
// Archive feature (files): which individual files are hidden from their
// project's everyday list. Same local-only sidecar reasoning as
// ARCHIVED_PROJECTS_KEY above. Entries are opaque composite keys identifying
// a (project, file) pair — encoding/decoding is owned by model.ts's
// encodeArchivedFileKey/decodeArchivedFileKey, this module doesn't need to
// know the format, same separation as dnd.ts payloads being opaque here.
const ARCHIVED_FILES_KEY = 'archivedFiles'
// Rename/delete tombstones (issue: a renamed or deleted file/project
// reappearing as a duplicate after a Drive sync). Deliberately NOT the
// same device-local pattern as ARCHIVED_PROJECTS_KEY/ARCHIVED_FILES_KEY
// above — the whole point is that a tombstone travels WITH the Drive
// snapshot (see google-drive-provider.ts's uploadSnapshot/pull) so a
// deletion actually propagates to a device that hasn't seen it yet; the
// local copy here is this device's own view, merged with whatever the
// last pull brought back (see tombstones.ts's mergeTombstones). Entries
// are opaque composite keys owned by model.ts's encodeArchivedFileKey/
// encodeProjectTombstoneKey — same opacity convention as ARCHIVED_FILES_KEY.
const TOMBSTONES_KEY = 'tombstones'

export interface LastEditedFile {
  project: string
  file: string
}

export function loadProjects(adapter: StorageAdapter = projectsAdapter): ProjectsState {
  const raw = adapter.get(PROJECTS_STORAGE_KEY)
  if (!raw) {
    const seeded = seedDefaultProjects()
    // Persist immediately (matching the prototype, which wrote the seed
    // to localStorage right away) so a reload doesn't seed a second,
    // differently-timestamped default project.
    writeEnvelope({ schemaVersion: CURRENT_SCHEMA_VERSION, projects: seeded }, adapter)
    return seeded
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error('Failed to parse stored projects; starting from an empty state.', error)
    return {}
  }

  if (isFutureSchema(parsed)) {
    // Written by a newer build than this one — most likely another tab
    // that already accepted an app update while this one is still running
    // stale JS (ADR-0003: the update prompt lets that window stay open
    // indefinitely). Read the data as-is rather than attempt to migrate
    // it — this build's migration list has no entry for a version ahead
    // of what it knows. Any later save from THIS tab stamps its own
    // honest CURRENT_SCHEMA_VERSION (see saveProjects) rather than
    // preserving the higher number: this build cannot promise the data
    // it writes is actually still shaped like that newer version, and a
    // down-stamp is safe precisely because migrations must stay purely
    // additive (see the INVARIANT note above) — the newer build simply
    // re-runs its migration next time it sees this data, which is a
    // no-op-or-repair, never a loss.
    console.warn(
      `Stored projects are stamped schemaVersion ${parsed.schemaVersion}, newer than this build's ${CURRENT_SCHEMA_VERSION}. Reading as-is without migrating.`,
    )
    return parsed.projects
  }

  const envelope = migrateStoredProjects(parsed)

  // Persist the migrated shape immediately so subsequent loads (and any
  // other code reading the `projects` key directly, e.g. Drive sync)
  // never see the legacy, un-versioned shape again.
  const wasAlreadyCurrent = isEnvelope(parsed) && parsed.schemaVersion === CURRENT_SCHEMA_VERSION
  if (!wasAlreadyCurrent) {
    writeEnvelope(envelope, adapter)
  }

  return envelope.projects
}

/**
 * Side-effect-free counterpart of `loadProjects` for a raw blob read from
 * somewhere other than the active adapter (storage-init.ts reconciling a
 * copy a stale tab left in localStorage). Returns `null` when the blob is
 * absent or unparseable — never seeds, never writes back.
 */
export function parseProjectsBlob(raw: string | null): ProjectsState | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (isFutureSchema(parsed)) return parsed.projects
  return migrateStoredProjects(parsed).projects
}

/**
 * Persists the projects blob. Throws on a storage failure (the caller —
 * useProjects' `persist` — turns that into an error toast and keeps the
 * previous state on screen).
 *
 * Issue #120: backups are best-effort, the document is not. When the write
 * hits the quota, evict backups oldest-first and retry after each eviction,
 * so accumulated safety-net copies can never be the reason the user's
 * actual edit is refused. Only a quota error triggers this — any other
 * failure is rethrown untouched, and if evicting every backup still isn't
 * enough the original error propagates.
 */
export function saveProjects(
  projects: ProjectsState,
  adapter: StorageAdapter = projectsAdapter,
): void {
  const envelope: StorageEnvelope = { schemaVersion: CURRENT_SCHEMA_VERSION, projects }
  try {
    writeEnvelope(envelope, adapter)
    return
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error
    while (evictOldestBackup(adapter)) {
      try {
        writeEnvelope(envelope, adapter)
        console.warn('Storage quota reached; evicted old backups to save projects.')
        return
      } catch (retryError) {
        if (!isQuotaExceededError(retryError)) throw retryError
      }
    }
    throw error
  }
}

function writeEnvelope(envelope: StorageEnvelope, adapter: StorageAdapter): void {
  adapter.set(PROJECTS_STORAGE_KEY, JSON.stringify(envelope))
}

/**
 * Deletes the oldest existing backup slot (scanning up to
 * LEGACY_MAX_BACKUPS, so orphans above the cap go first). Returns whether
 * anything was deleted. Shared by `saveProjects`' synchronous quota
 * recovery and storage-init.ts's asynchronous one (IndexedDB reports quota
 * failures only after the write was queued).
 */
export function evictOldestBackup(adapter: StorageAdapter = projectsAdapter): boolean {
  for (let index = LEGACY_MAX_BACKUPS; index >= 1; index--) {
    const key = `${BACKUP_KEY_PREFIX}${index}`
    if (adapter.get(key) === null) continue
    adapter.remove(key)
    return true
  }
  return false
}

// `QuotaExceededError` is the standard name; legacy Firefox used
// `NS_ERROR_DOM_QUOTA_REACHED`, and old WebKit only set the numeric code 22.
export function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22)
  )
}

/**
 * Independent safety net for destructive operations (bulk delete, ZIP
 * import overwrite, restore-from-backup): snapshots the *current*
 * persisted `projects` state into a rotating backup key
 * (`projects_backup_1` .. `projects_backup_{cap}`, cap per backend) before the
 * caller proceeds to overwrite/delete it.
 *
 * Call this with the in-memory state that is *about to be replaced*,
 * right before the destructive `saveProjects` call — not after.
 *
 * Deduplicated (issue #120): when the snapshot is identical to the newest
 * backup, nothing is written — a second copy protects nothing and would
 * push a genuinely different older snapshot out of the rotation. This is
 * an exact comparison of the serialized blob, deliberately NOT a
 * "structural changes only" heuristic: a ZIP import or a Drive merge
 * overwrites same-named files' CONTENT without changing any names, and that
 * content is precisely what the backup exists to preserve.
 *
 * Best-effort: a full backup rotation can push localStorage over its quota
 * (it's already the operation most likely to do so, since it writes extra
 * full copies of the `projects` blob). Failing to back up must never block
 * the real, user-requested mutation that's about to happen — so any
 * storage error here is logged and swallowed rather than thrown.
 */
export function backupProjects(
  current: ProjectsState,
  adapter: StorageAdapter = projectsAdapter,
): void {
  try {
    const snapshot = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projects: current })
    if (adapter.get(`${BACKUP_KEY_PREFIX}1`) === snapshot) return
    rotateBackups(adapter)
    adapter.set(`${BACKUP_KEY_PREFIX}1`, snapshot)
  } catch (error) {
    console.error('Failed to write projects backup; continuing without it.', error)
  }
}

function rotateBackups(adapter: StorageAdapter): void {
  for (let index = maxBackups; index >= 1; index--) {
    const key = `${BACKUP_KEY_PREFIX}${index}`
    const value = adapter.get(key)
    if (value === null) continue
    if (index === maxBackups) {
      adapter.remove(key)
    } else {
      adapter.set(`${BACKUP_KEY_PREFIX}${index + 1}`, value)
    }
  }
}

/**
 * Deletes backup slots above the active cap, up to the highest index any
 * build ever wrote (see LEGACY_MAX_BACKUPS). Run once at boot: after the
 * cap dropped from 50, slots 4..50 would otherwise sit in localStorage
 * forever, still consuming the quota the lower cap was meant to free.
 * Best-effort — a failure here only leaves stale copies behind.
 */
export function pruneExcessBackups(adapter: StorageAdapter = projectsAdapter): void {
  try {
    for (let index = maxBackups + 1; index <= LEGACY_MAX_BACKUPS; index++) {
      const key = `${BACKUP_KEY_PREFIX}${index}`
      if (adapter.get(key) !== null) adapter.remove(key)
    }
  } catch (error) {
    console.error('Failed to prune excess projects backups; continuing.', error)
  }
}

/**
 * Every key the projects feature owns in the blob store: the primary blob
 * plus all backup slots any build could have written. storage-init.ts uses
 * this to copy them into IndexedDB and then clear them from localStorage.
 */
export function projectsStorageKeys(): { primary: string; backups: string[] } {
  const backups: string[] = []
  for (let index = 1; index <= LEGACY_MAX_BACKUPS; index++) {
    backups.push(`${BACKUP_KEY_PREFIX}${index}`)
  }
  return { primary: PROJECTS_STORAGE_KEY, backups }
}

/**
 * Reads the last file the user had open (issue #92: reopen where you left
 * off). Returns `null` when nothing valid is stored — the shape is
 * validated defensively because a hand-edited or corrupt value must never
 * crash startup; the caller additionally checks the file still exists
 * before selecting it.
 */
export function loadLastEditedFile(
  adapter: StorageAdapter = localStorageAdapter,
): LastEditedFile | null {
  const raw = adapter.get(LAST_EDITED_FILE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as LastEditedFile).project === 'string' &&
      typeof (parsed as LastEditedFile).file === 'string'
    ) {
      return { project: (parsed as LastEditedFile).project, file: (parsed as LastEditedFile).file }
    }
  } catch (error) {
    console.error('Failed to parse last-edited-file pointer; ignoring it.', error)
  }
  return null
}

/** Persists the currently open file so a later visit can reopen it. Best-effort. */
export function saveLastEditedFile(
  selection: LastEditedFile | null,
  adapter: StorageAdapter = localStorageAdapter,
): void {
  try {
    if (selection === null) {
      adapter.remove(LAST_EDITED_FILE_KEY)
    } else {
      adapter.set(LAST_EDITED_FILE_KEY, JSON.stringify(selection))
    }
  } catch (error) {
    console.error('Failed to persist last-edited-file pointer; continuing.', error)
  }
}

/**
 * Reads a JSON-array-of-names sidecar key as a `Set<string>`. Shared by
 * every "which projects are …" sidecar (collapsed, archived): returns an
 * empty set on anything missing or malformed — a neutral default rather
 * than a thrown error, since losing this state never risks a document.
 */
function loadNameSet(key: string, adapter: StorageAdapter): Set<string> {
  const raw = adapter.get(key)
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((name): name is string => typeof name === 'string'))
    }
  } catch (error) {
    console.error(`Failed to parse "${key}" name set; ignoring it.`, error)
  }
  return new Set()
}

/** Persists a name set to a sidecar key as a JSON array. Best-effort. */
function saveNameSet(key: string, names: Iterable<string>, adapter: StorageAdapter): void {
  try {
    adapter.set(key, JSON.stringify(Array.from(names)))
  } catch (error) {
    console.error(`Failed to persist "${key}" name set; continuing.`, error)
  }
}

/**
 * Reads the set of project names the user has collapsed (issue #92:
 * remember collapsed/expanded state). Returns an empty set on anything
 * malformed — a missing entry means "nothing collapsed", i.e. every
 * project expanded, matching the previous always-expanded default.
 */
export function loadCollapsedProjects(adapter: StorageAdapter = localStorageAdapter): Set<string> {
  return loadNameSet(COLLAPSED_PROJECTS_KEY, adapter)
}

/** Persists the collapsed-project name set. Best-effort. */
export function saveCollapsedProjects(
  names: Iterable<string>,
  adapter: StorageAdapter = localStorageAdapter,
): void {
  saveNameSet(COLLAPSED_PROJECTS_KEY, names, adapter)
}

/**
 * Reads the set of project names the user has archived. Returns an empty
 * set on anything malformed — a missing entry means "nothing archived",
 * i.e. every project visible, matching the pre-feature default.
 */
export function loadArchivedProjects(adapter: StorageAdapter = localStorageAdapter): Set<string> {
  return loadNameSet(ARCHIVED_PROJECTS_KEY, adapter)
}

/** Persists the archived-project name set. Best-effort. */
export function saveArchivedProjects(
  names: Iterable<string>,
  adapter: StorageAdapter = localStorageAdapter,
): void {
  saveNameSet(ARCHIVED_PROJECTS_KEY, names, adapter)
}

/**
 * Reads the set of archived-file composite keys (see model.ts's
 * encodeArchivedFileKey). Returns an empty set on anything malformed — a
 * missing entry means "nothing archived", matching the pre-feature default.
 */
export function loadArchivedFiles(adapter: StorageAdapter = localStorageAdapter): Set<string> {
  return loadNameSet(ARCHIVED_FILES_KEY, adapter)
}

/** Persists the archived-file key set. Best-effort. */
export function saveArchivedFiles(
  names: Iterable<string>,
  adapter: StorageAdapter = localStorageAdapter,
): void {
  saveNameSet(ARCHIVED_FILES_KEY, names, adapter)
}

/**
 * Reads the tombstone map (see tombstones.ts). Returns an empty object on
 * anything missing or malformed — a missing/corrupt entry means "nothing
 * remembered as deleted", the neutral default, matching every other
 * sidecar here.
 */
export function loadTombstones(
  adapter: StorageAdapter = localStorageAdapter,
): Record<string, string> {
  const raw = adapter.get(TOMBSTONES_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const result: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') result[key] = value
      }
      return result
    }
  } catch (error) {
    console.error(`Failed to parse "${TOMBSTONES_KEY}"; ignoring it.`, error)
  }
  return {}
}

/** Persists the tombstone map. Best-effort. */
export function saveTombstones(
  tombstones: Readonly<Record<string, string>>,
  adapter: StorageAdapter = localStorageAdapter,
): void {
  try {
    adapter.set(TOMBSTONES_KEY, JSON.stringify(tombstones))
  } catch (error) {
    console.error(`Failed to persist "${TOMBSTONES_KEY}"; continuing.`, error)
  }
}
