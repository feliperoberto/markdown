// Migration layer for the `projects` blob persisted in `localStorage`.
//
// Historically (schemaVersion 0) `projects` was stored as a raw
// `ProjectsState` JSON blob with no version tag at all. From
// schemaVersion 1 onward it is stored as an envelope:
//
//   { schemaVersion: number, projects: ProjectsState }
//
// The envelope is stored under the *same* `projects` key (rather than a
// separate `projectsSchemaVersion` key) so the version travels atomically
// with the data it describes — there is never a window where a version
// key and the data key can disagree after a partial write, and any code
// still reading `projects` directly (e.g. Drive sync payloads, backups)
// only has to reason about one key.
//
// Adding a future schema change means: bump `CURRENT_SCHEMA_VERSION` and
// append one more `{ from, migrate }` entry to `migrations` below — never
// mutate an existing migration once it has shipped.
import type { ProjectsState } from '@/features/projects/types'

export const CURRENT_SCHEMA_VERSION = 1

export interface StorageEnvelope {
  schemaVersion: number
  projects: ProjectsState
}

interface Migration {
  /** The schemaVersion this migration upgrades *from*. */
  from: number
  /** Transforms the envelope at `from` into the envelope at `from + 1`. */
  migrate: (envelope: StorageEnvelope) => StorageEnvelope
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isEnvelope(value: unknown): value is StorageEnvelope {
  return isPlainObject(value) && typeof value.schemaVersion === 'number' && isPlainObject(value.projects)
}

const migrations: Migration[] = [
  {
    // schemaVersion 0 -> 1: no-op on the data itself — schemaVersion 0
    // data has already been lifted into `{ schemaVersion: 0, projects }`
    // by `parseStoredEnvelope` below (since legacy data was a raw blob,
    // not an envelope at all). This migration only exists to prove/exercise
    // the migration-runner mechanism and to bump the stamped version.
    from: 0,
    migrate: (envelope) => ({ schemaVersion: 1, projects: envelope.projects }),
  },
]

/**
 * Normalizes `raw` (the parsed JSON previously stored under the `projects`
 * key, in any historical shape) into a schemaVersion-0 envelope, ready to
 * be run through {@link migrateStoredProjects}.
 */
function parseStoredEnvelope(raw: unknown): StorageEnvelope {
  if (isEnvelope(raw)) return raw
  // Legacy shape: `projects` held the raw `ProjectsState` blob directly,
  // with no envelope and no version tag at all.
  return { schemaVersion: 0, projects: isPlainObject(raw) ? (raw as ProjectsState) : {} }
}

/**
 * Detects the schemaVersion of `raw` and runs any pending migrations, in
 * order, until it reaches {@link CURRENT_SCHEMA_VERSION}.
 */
export function migrateStoredProjects(raw: unknown): StorageEnvelope {
  let envelope = parseStoredEnvelope(raw)

  while (envelope.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migration = migrations.find((m) => m.from === envelope.schemaVersion)
    if (!migration) {
      // No migration registered for this version; stop to avoid an
      // infinite loop and surface data as-is rather than corrupting it.
      break
    }
    envelope = migration.migrate(envelope)
  }

  return envelope
}
