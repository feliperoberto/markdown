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
// restore-from-backup) — see `backupProjects` below. Capped at
// `MAX_BACKUPS` so localStorage usage stays bounded; oldest backup is
// dropped once the cap is reached.
const BACKUP_KEY_PREFIX = 'projects_backup_'
const MAX_BACKUPS = 5

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

export interface LastEditedFile {
  project: string
  file: string
}

export function loadProjects(adapter: StorageAdapter = localStorageAdapter): ProjectsState {
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
    // it or downgrade its stamp; `stampedSchemaVersion` below independently
    // re-checks what's on disk before every write, so this tab's own
    // future edits still preserve the higher version.
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

export function saveProjects(
  projects: ProjectsState,
  adapter: StorageAdapter = localStorageAdapter,
): void {
  writeEnvelope({ schemaVersion: stampedSchemaVersion(adapter), projects }, adapter)
}

function writeEnvelope(envelope: StorageEnvelope, adapter: StorageAdapter): void {
  adapter.set(PROJECTS_STORAGE_KEY, JSON.stringify(envelope))
}

/**
 * The schemaVersion to stamp on a write from THIS build: normally
 * `CURRENT_SCHEMA_VERSION`, but never lower than whatever is already on
 * disk (ADR-0003) — a tab that outlives a deploy and keeps running an old
 * build must not downgrade a newer tab's stamp back down when it persists
 * its own edits. Re-derives from the adapter on every call rather than
 * caching the observed version in module state, so it stays correct
 * across concurrent tabs (and across unit tests reusing the same module)
 * without needing an explicit reset hook.
 */
function stampedSchemaVersion(adapter: StorageAdapter): number {
  const raw = adapter.get(PROJECTS_STORAGE_KEY)
  if (!raw) return CURRENT_SCHEMA_VERSION
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isFutureSchema(parsed)) return parsed.schemaVersion
  } catch {
    // Malformed on-disk value — fall through. This is a best-effort read
    // for stamping purposes only; the real parse/error-handling for the
    // stored value happens in loadProjects.
  }
  return CURRENT_SCHEMA_VERSION
}

/**
 * Independent safety net for destructive operations (bulk delete, ZIP
 * import overwrite, restore-from-backup): snapshots the *current*
 * persisted `projects` state into a rotating backup key
 * (`projects_backup_1` .. `projects_backup_{MAX_BACKUPS}`) before the
 * caller proceeds to overwrite/delete it.
 *
 * Call this with the in-memory state that is *about to be replaced*,
 * right before the destructive `saveProjects` call — not after.
 *
 * Best-effort: a full backup rotation can push localStorage over its quota
 * (it's already the operation most likely to do so, since it writes extra
 * full copies of the `projects` blob). Failing to back up must never block
 * the real, user-requested mutation that's about to happen — so any
 * storage error here is logged and swallowed rather than thrown.
 */
export function backupProjects(
  current: ProjectsState,
  adapter: StorageAdapter = localStorageAdapter,
): void {
  try {
    rotateBackups(adapter)
    adapter.set(
      `${BACKUP_KEY_PREFIX}1`,
      JSON.stringify({ schemaVersion: stampedSchemaVersion(adapter), projects: current }),
    )
  } catch (error) {
    console.error('Failed to write projects backup; continuing without it.', error)
  }
}

function rotateBackups(adapter: StorageAdapter): void {
  for (let index = MAX_BACKUPS; index >= 1; index--) {
    const key = `${BACKUP_KEY_PREFIX}${index}`
    const value = adapter.get(key)
    if (value === null) continue
    if (index === MAX_BACKUPS) {
      adapter.remove(key)
    } else {
      adapter.set(`${BACKUP_KEY_PREFIX}${index + 1}`, value)
    }
  }
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
