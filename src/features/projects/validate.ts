/**
 * Normalizes an untrusted `ProjectsState`-shaped blob (a restored Drive
 * backup, or any other externally-sourced snapshot) into a well-formed
 * `ProjectsState` before it's merged into the store.
 *
 * Unlike `src/lib/storage-migrations.ts` (which only validates the
 * *envelope* — `{ schemaVersion, projects }` — for data loaded from
 * localStorage), nothing previously validated the *inner* shape of each
 * project/file. A restore/import boundary (Drive backup, hand-edited
 * file, a backup written by a different schema version) could install
 * `ProjectFile` entries whose `name` didn't match their object key, whose
 * `content` wasn't a string, or whose `size`/`timestamp` were stale —
 * corrupting state or leaving files unreachable (see: restore/merge
 * orphans files when name !== key).
 *
 * This function never throws: it repairs what it safely can and drops
 * what it can't, so a partially-malformed backup degrades gracefully
 * (fewer files restored) instead of corrupting the whole store or
 * crashing the restore flow.
 *
 * Deliberately does NOT run `migrateStoredProjects` — that migrator
 * targets the localStorage envelope's `schemaVersion`, a concept that
 * doesn't exist in a Drive backup's `{ version, exportedAt, projects }`
 * envelope (see `google-drive-provider.ts#uploadSnapshot`); running it
 * here would be a meaningless no-op, not a genuine migration.
 */
import { sanitizeNameSegment } from '@/lib/sanitize'
import type { ProjectFile, ProjectFiles, ProjectsState } from './types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeFile(fileKey: string, raw: unknown): ProjectFile | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.content !== 'string') return null

  const name = sanitizeNameSegment(fileKey)
  if (!name) return null

  const content = raw.content
  const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString()

  return { name, content, size: content.length, timestamp }
}

function normalizeFiles(raw: unknown): ProjectFiles {
  if (!isPlainObject(raw)) return {}

  const files: ProjectFiles = {}
  for (const [fileKey, fileValue] of Object.entries(raw)) {
    const file = normalizeFile(fileKey, fileValue)
    if (file) files[file.name] = file
  }
  return files
}

/**
 * Normalizes a raw, untrusted value into a `ProjectsState`. Non-object
 * projects/files and files with non-string content are dropped; project
 * and file names are run through `sanitizeNameSegment` (structural/path
 * hardening — the same guard ZIP import applies, which a Drive restore
 * previously skipped); `file.name` is always forced to equal its object
 * key; `size` is always recomputed from `content.length` rather than
 * trusted from the incoming blob. Empty projects (no files) are kept —
 * that's a legal, common state, not a malformed one.
 */
export function normalizeProjectsState(raw: unknown): ProjectsState {
  if (!isPlainObject(raw)) return {}

  const state: ProjectsState = {}
  for (const [projectKey, projectValue] of Object.entries(raw)) {
    const projectName = sanitizeNameSegment(projectKey)
    if (!projectName) continue
    state[projectName] = normalizeFiles(projectValue)
  }
  return state
}
