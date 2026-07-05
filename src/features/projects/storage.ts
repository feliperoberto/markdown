import { localStorageAdapter, type StorageAdapter } from '@/lib/storage-adapter'
import {
  CURRENT_SCHEMA_VERSION,
  isEnvelope,
  migrateStoredProjects,
  type StorageEnvelope,
} from '@/lib/storage-migrations'
import type { ProjectsState } from './types'

const PROJECTS_STORAGE_KEY = 'projects'

// Rotating backups, written as an independent safety net immediately
// before any destructive operation (bulk delete, ZIP import overwrite,
// restore-from-backup) — see `backupProjects` below. Capped at
// `MAX_BACKUPS` so localStorage usage stays bounded; oldest backup is
// dropped once the cap is reached.
const BACKUP_KEY_PREFIX = 'projects_backup_'
const MAX_BACKUPS = 5

export function loadProjects(adapter: StorageAdapter = localStorageAdapter): ProjectsState {
  const raw = adapter.get(PROJECTS_STORAGE_KEY)
  if (!raw) return {}

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
