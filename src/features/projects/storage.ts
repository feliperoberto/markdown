import { localStorageAdapter, type StorageAdapter } from '@/lib/storage-adapter'
import {
  CURRENT_SCHEMA_VERSION,
  isEnvelope,
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
  writeEnvelope({ schemaVersion: CURRENT_SCHEMA_VERSION, projects }, adapter)
}

function writeEnvelope(envelope: StorageEnvelope, adapter: StorageAdapter): void {
  adapter.set(PROJECTS_STORAGE_KEY, JSON.stringify(envelope))
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
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projects: current }),
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
 * Reads the set of project names the user has collapsed (issue #92:
 * remember collapsed/expanded state). Returns an empty set on anything
 * malformed — a missing entry means "nothing collapsed", i.e. every
 * project expanded, matching the previous always-expanded default.
 */
export function loadCollapsedProjects(adapter: StorageAdapter = localStorageAdapter): Set<string> {
  const raw = adapter.get(COLLAPSED_PROJECTS_KEY)
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((name): name is string => typeof name === 'string'))
    }
  } catch (error) {
    console.error('Failed to parse collapsed-projects set; ignoring it.', error)
  }
  return new Set()
}

/** Persists the collapsed-project name set. Best-effort. */
export function saveCollapsedProjects(
  names: Iterable<string>,
  adapter: StorageAdapter = localStorageAdapter,
): void {
  try {
    adapter.set(COLLAPSED_PROJECTS_KEY, JSON.stringify(Array.from(names)))
  } catch (error) {
    console.error('Failed to persist collapsed-projects set; continuing.', error)
  }
}
