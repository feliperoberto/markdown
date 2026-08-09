// Pure, immutable CRUD operations over `ProjectsState`. No persistence or
// DOM concerns here — callers (e.g. `useProjects`) are responsible for
// persisting the returned state via the storage adapter.
import type { ProjectFile, ProjectFiles, ProjectsState } from './types'

export function projectExists(state: ProjectsState, projectName: string): boolean {
  return Object.prototype.hasOwnProperty.call(state, projectName)
}

/**
 * First file in the first project that has one, in insertion order (issue
 * #92). Used as the fallback when the remembered last-edited file no longer
 * exists (and to focus a real file on init so typing edits something).
 * Skips empty projects; returns `null` only when no project holds any file.
 *
 * `skipProjects` (archive feature) additionally skips any project named in
 * it — e.g. picking the next file to focus after the current project was
 * archived, without proposing another hidden project's file.
 */
export function firstFileOf(
  state: ProjectsState,
  skipProjects?: ReadonlySet<string>,
  skipFiles?: ReadonlySet<string>,
): { project: string; file: string } | null {
  for (const project of Object.keys(state)) {
    if (skipProjects?.has(project)) continue
    for (const file of Object.keys(state[project] ?? {})) {
      if (skipFiles?.has(encodeArchivedFileKey(project, file))) continue
      return { project, file }
    }
  }
  return null
}

export function fileExists(state: ProjectsState, projectName: string, fileName: string): boolean {
  // Guarded with `projectExists` (an own-property check), not a bare
  // `state[projectName]` truthiness check: for a project name that
  // coincides with an inherited `Object.prototype` member (e.g.
  // "constructor"), `state[projectName]` resolves through the prototype
  // chain to a real (truthy) function object even when no such project
  // exists in `state` — and that function object itself has own properties
  // like "name"/"length"/"prototype", which would make the second
  // `hasOwnProperty` check below a false positive too.
  return (
    projectExists(state, projectName) &&
    Object.prototype.hasOwnProperty.call(state[projectName], fileName)
  )
}

export function createProject(state: ProjectsState, projectName: string): ProjectsState {
  if (!projectName || projectExists(state, projectName)) return state
  return { ...state, [projectName]: {} }
}

export function renameProject(
  state: ProjectsState,
  oldName: string,
  newName: string,
): ProjectsState {
  if (
    !newName ||
    oldName === newName ||
    !projectExists(state, oldName) ||
    projectExists(state, newName)
  ) {
    return state
  }
  const next: ProjectsState = { ...state }
  next[newName] = next[oldName] as ProjectFiles
  delete next[oldName]
  return next
}

export function deleteProject(state: ProjectsState, projectName: string): ProjectsState {
  if (!projectExists(state, projectName)) return state
  const next: ProjectsState = { ...state }
  delete next[projectName]
  return next
}

export function createFile(
  state: ProjectsState,
  projectName: string,
  fileName: string,
  content = '',
): ProjectsState {
  if (!projectExists(state, projectName) || !fileName || fileExists(state, projectName, fileName)) {
    return state
  }
  const file: ProjectFile = {
    name: fileName,
    content,
    size: content.length,
    timestamp: new Date().toISOString(),
  }
  return {
    ...state,
    [projectName]: { ...state[projectName], [fileName]: file },
  }
}

export function renameFile(
  state: ProjectsState,
  projectName: string,
  oldFileName: string,
  newFileName: string,
): ProjectsState {
  if (
    !newFileName ||
    oldFileName === newFileName ||
    !fileExists(state, projectName, oldFileName) ||
    fileExists(state, projectName, newFileName)
  ) {
    return state
  }
  const files = { ...state[projectName] }
  const file = files[oldFileName] as ProjectFile
  files[newFileName] = { ...file, name: newFileName }
  delete files[oldFileName]
  return { ...state, [projectName]: files }
}

export function deleteFile(
  state: ProjectsState,
  projectName: string,
  fileName: string,
): ProjectsState {
  if (!fileExists(state, projectName, fileName)) return state
  const files = { ...state[projectName] }
  delete files[fileName]
  return { ...state, [projectName]: files }
}

export function updateFileContent(
  state: ProjectsState,
  projectName: string,
  fileName: string,
  content: string,
): ProjectsState {
  if (!fileExists(state, projectName, fileName)) return state
  const file = state[projectName]![fileName] as ProjectFile
  return {
    ...state,
    [projectName]: {
      ...state[projectName],
      [fileName]: { ...file, content, size: content.length, timestamp: new Date().toISOString() },
    },
  }
}

/**
 * Reorders a file within its project (issue #92: drag & drop). The file is
 * lifted out and reinserted before `beforeFile` (or appended when
 * `beforeFile` is null/unknown) — an order-preserving rebuild, same
 * approach as `moveProject` below.
 *
 * Moving a file to a DIFFERENT project is not supported (removed feature —
 * see CHANGELOG); every call here is a same-project reorder. A no-op-
 * returning guard (identical reference back) protects every invalid
 * request — unknown project/file, or dropping a file onto itself.
 * `ProjectFile` references are preserved as-is; only object key ordering
 * changes.
 */
export function moveFile(
  state: ProjectsState,
  projectName: string,
  fileName: string,
  beforeFile: string | null = null,
): ProjectsState {
  if (!fileExists(state, projectName, fileName)) return state
  // Reordering a file relative to itself is a no-op.
  if (beforeFile === fileName) return state

  const moving = state[projectName]![fileName] as ProjectFile
  const entries = Object.entries(state[projectName]!).filter(([key]) => key !== fileName)
  const index = beforeFile ? entries.findIndex(([key]) => key === beforeFile) : -1
  const at = index < 0 ? entries.length : index
  entries.splice(at, 0, [fileName, moving])
  return { ...state, [projectName]: Object.fromEntries(entries) }
}

/**
 * Reorders a project (issue #92: sort projects). The project is lifted out
 * and reinserted before `beforeProject` (or appended when it's
 * null/unknown). Returns the same reference on an invalid/no-op request
 * (unknown project, or dropping a project onto itself). File contents are
 * untouched; only the top-level project key ordering changes.
 */
export function moveProject(
  state: ProjectsState,
  projectName: string,
  beforeProject: string | null = null,
): ProjectsState {
  if (!projectExists(state, projectName)) return state
  if (beforeProject === projectName) return state

  const entries = Object.entries(state).filter(([key]) => key !== projectName)
  const index = beforeProject ? entries.findIndex(([key]) => key === beforeProject) : -1
  const at = index < 0 ? entries.length : index
  entries.splice(at, 0, [projectName, state[projectName] as ProjectFiles])
  return Object.fromEntries(entries)
}

/**
 * ZIP-import merge: additive, incoming file wins on a same-key collision.
 * Matches the legacy prototype's import behavior ("ZIP prevalece em
 * conflito de arquivo") — an intentional overwrite of a same-named local
 * file with the freshly-imported one.
 */
export function mergeProjects(base: ProjectsState, incoming: ProjectsState): ProjectsState {
  const next: ProjectsState = { ...base }
  for (const [projectName, files] of Object.entries(incoming)) {
    next[projectName] = { ...next[projectName], ...files }
  }
  return next
}

/**
 * Drive-restore merge: additive, LOCAL file wins on a same-key collision.
 * Matches the legacy prototype's `driveImport` (`{ ...data.projects,
 * ...projects }` — local spread last), which always preserved local-only
 * projects/files and never let a Drive backup silently overwrite local
 * edits. This is a strict superset of that guarantee: union of all
 * projects, local wins every file collision, nothing local is ever lost.
 *
 * Deliberately NOT a destructive replace — "restore" here means
 * "reconcile a Drive backup into local state", not "wipe local state and
 * replace it with the backup". A true destructive replace would need its
 * own explicit, confirm-gated action; this function doesn't offer one.
 */
export function mergeRestoredProjects(
  local: ProjectsState,
  incoming: ProjectsState,
): ProjectsState {
  const next: ProjectsState = { ...incoming }
  for (const [projectName, files] of Object.entries(local)) {
    next[projectName] = { ...next[projectName], ...files }
  }
  return next
}

export interface FreshnessMergeResult {
  merged: ProjectsState
  /** True when `merged` contains a remote file/version not already local — caller should update local state. */
  localChanged: boolean
  /** True when `merged` contains a local file/version not already remote — caller should push. */
  remoteChanged: boolean
}

// Stable empty-object default for `mergeProjectsByFreshness`'s `tombstones`
// param — a `= {}` default parameter would allocate a fresh object every
// call, which doesn't matter for correctness here but breaks the pattern
// every other stable-empty-default in this codebase follows (see
// ProjectsSidebar.tsx's NO_ARCHIVED etc.).
const NO_TOMBSTONES: Readonly<Record<string, string>> = {}

/**
 * Freshness-based merge for smart sync (issue: eliminate blind-overwrite
 * sync). For a file present on both sides, keeps whichever has the newer
 * `timestamp` (ISO-8601, so lexical compare is correct); a tie keeps local.
 * A file present on only one side is always kept — this union is what
 * actually eliminates the data-loss risk: neither a lagging local device
 * nor a lagging remote backup can silently erase the other's exclusive
 * files, unlike `mergeProjects` (incoming always wins) or
 * `mergeRestoredProjects` (local always wins).
 *
 * `tombstones` (composite key -> ISO deletedAt, see tombstones.ts) closes
 * the gap that union alone leaves open: identity here is the object key
 * (`encodeArchivedFileKey`-shaped for a file, `encodeProjectTombstoneKey`-
 * shaped for a whole project), so a rename is a key move — the old key
 * survives in whichever side hasn't synced the rename yet, and a plain
 * union would resurrect it forever. A **remote-only** entry (never a local
 * one — local edits always survive a sync, matching every other merge
 * function in this file) is dropped when a tombstone for its key is newer
 * than the remote content it would otherwise restore; a remote edit made
 * *after* the deletion is still newer than the tombstone and wins normally,
 * which is what actually distinguishes "reappeared because it was never
 * told about the deletion" from "was genuinely recreated/edited elsewhere
 * since". A whole remote-only project is dropped the same way, checked
 * against the newest of its remote files so a single post-deletion edit
 * anywhere in it is enough to resurrect the rest.
 */
export function mergeProjectsByFreshness(
  local: ProjectsState,
  remote: ProjectsState,
  tombstones: Readonly<Record<string, string>> = NO_TOMBSTONES,
): FreshnessMergeResult {
  const merged: ProjectsState = {}
  let localChanged = false
  let remoteChanged = false

  const projectNames = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const projectName of projectNames) {
    const remoteFiles = remote[projectName] ?? {}

    if (!projectExists(local, projectName)) {
      const projectTombstone = tombstones[encodeProjectTombstoneKey(projectName)]
      if (projectTombstone) {
        const remoteFileList = Object.values(remoteFiles)
        // `.every()` on an empty array is vacuously true, so an EMPTY
        // remote project would otherwise always count as "untouched since
        // deletion" regardless of how old the tombstone is — including
        // when the empty project is a legitimate fresh recreation of that
        // name on another device (no per-file timestamp exists yet to
        // prove otherwise). Requiring at least one file keeps the tombstone
        // meaningful only where it has actual evidence to compare against;
        // an ambiguous empty project is kept, matching this function's
        // general bias toward not discarding data it can't be sure about.
        const untouchedSinceDeletion =
          remoteFileList.length > 0 &&
          remoteFileList.every((file) => file.timestamp <= projectTombstone)
        if (untouchedSinceDeletion) {
          // The whole project is dropped — never added to `merged` at all,
          // not even as an empty project — and remote must catch up.
          remoteChanged = true
          continue
        }
      }
    }

    const localFiles = local[projectName] ?? {}
    const files: ProjectFiles = {}

    const fileNames = new Set([...Object.keys(localFiles), ...Object.keys(remoteFiles)])
    for (const fileName of fileNames) {
      const localFile = localFiles[fileName]
      const remoteFile = remoteFiles[fileName]

      if (localFile && remoteFile) {
        if (remoteFile.timestamp > localFile.timestamp) {
          files[fileName] = remoteFile
          localChanged = true
        } else {
          files[fileName] = localFile
          if (remoteFile.timestamp !== localFile.timestamp) remoteChanged = true
        }
      } else if (localFile) {
        files[fileName] = localFile
        remoteChanged = true
      } else if (remoteFile) {
        const fileTombstone = tombstones[encodeArchivedFileKey(projectName, fileName)]
        if (fileTombstone && fileTombstone > remoteFile.timestamp) {
          remoteChanged = true
          continue
        }
        files[fileName] = remoteFile
        localChanged = true
      }
    }

    merged[projectName] = files
  }

  return { merged, localChanged, remoteChanged }
}

/**
 * Carries an archived flag across a project rename (project identity is the
 * object key, so a rename is a key move — see `renameProject`). Returns the
 * same reference when `oldName` isn't archived, matching this file's
 * same-reference-on-no-op convention.
 */
export function renameInArchived(
  archived: ReadonlySet<string>,
  oldName: string,
  newName: string,
): ReadonlySet<string> {
  if (!archived.has(oldName)) return archived
  const next = new Set(archived)
  next.delete(oldName)
  next.add(newName)
  return next
}

/**
 * Drops archived-set entries for projects that no longer exist (deleted, or
 * a stale name from a previous session) so the persisted set doesn't
 * accumulate garbage forever. Uses `Object.prototype.hasOwnProperty` (not
 * `name in state`) so a project literally named `constructor`/`toString`
 * behaves, matching `projectExists`. Returns the same reference when
 * nothing is stale.
 */
export function pruneArchived(
  archived: ReadonlySet<string>,
  state: ProjectsState,
): ReadonlySet<string> {
  const next = new Set([...archived].filter((name) => projectExists(state, name)))
  return next.size === archived.size ? archived : next
}

/**
 * Archived-files sidecar entries identify a `(project, file)` pair. File
 * names aren't globally unique across projects (unlike project names), so a
 * bare name set won't do — but user-typed names aren't sanitized against
 * containing arbitrary characters either (only the ZIP-import/Drive-restore
 * boundary does that), so a hand-rolled delimiter scheme would be unsafe.
 * JSON-array encoding sidesteps that entirely; `encodeProjectTombstoneKey`
 * below and `tombstones.ts` reuse the same reasoning.
 */
export function encodeArchivedFileKey(projectName: string, fileName: string): string {
  return JSON.stringify([projectName, fileName])
}

/** Never throws — a hand-edited/corrupt entry decodes to `null`, matching this file's defensive-parsing convention. */
export function decodeArchivedFileKey(key: string): { project: string; file: string } | null {
  try {
    const parsed = JSON.parse(key) as unknown
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      return { project: parsed[0], file: parsed[1] }
    }
  } catch {
    // Not our key (or malformed) — ignore.
  }
  return null
}

/**
 * Project-level tombstone key (see tombstones.ts). Same JSON-array
 * encoding as `encodeArchivedFileKey` for the same reason — project names
 * aren't sanitized against arbitrary characters outside the ZIP-import/
 * Drive-restore boundary, so a hand-rolled delimiter would be unsafe — but
 * a single-element array, which is what distinguishes a whole-project
 * tombstone from a per-file one sharing the same key space.
 */
export function encodeProjectTombstoneKey(projectName: string): string {
  return JSON.stringify([projectName])
}

/** Never throws — a hand-edited/corrupt entry decodes to `null`, matching this file's defensive-parsing convention. */
export function decodeProjectTombstoneKey(key: string): { project: string } | null {
  try {
    const parsed = JSON.parse(key) as unknown
    if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
      return { project: parsed[0] }
    }
  } catch {
    // Not our key (or malformed) — ignore.
  }
  return null
}

export function isFileArchived(
  archivedFiles: ReadonlySet<string>,
  projectName: string,
  fileName: string,
): boolean {
  return archivedFiles.has(encodeArchivedFileKey(projectName, fileName))
}

/**
 * Carries an archived-file flag across a same-project file rename (file
 * identity is the object key within its project, so a rename is a key move
 * — see `renameFile`). Returns the same reference when `oldFileName` isn't
 * archived, matching this file's same-reference-on-no-op convention.
 */
export function renameFileInArchivedFiles(
  archivedFiles: ReadonlySet<string>,
  projectName: string,
  oldFileName: string,
  newFileName: string,
): ReadonlySet<string> {
  const oldKey = encodeArchivedFileKey(projectName, oldFileName)
  if (!archivedFiles.has(oldKey)) return archivedFiles
  const next = new Set(archivedFiles)
  next.delete(oldKey)
  next.add(encodeArchivedFileKey(projectName, newFileName))
  return next
}

/**
 * Cascade for a project rename: every archived-file entry belonging to
 * `oldProjectName` must be rekeyed to `newProjectName`, or it silently
 * un-archives (its composite key would point at a project name that no
 * longer exists). Unlike `pruneArchivedFiles`, which only drops stale
 * entries, this carries them — the same distinction `renameInArchived`
 * makes for projects themselves.
 */
export function renameProjectInArchivedFiles(
  archivedFiles: ReadonlySet<string>,
  oldProjectName: string,
  newProjectName: string,
): ReadonlySet<string> {
  let changed = false
  const next = new Set<string>()
  for (const key of archivedFiles) {
    const decoded = decodeArchivedFileKey(key)
    if (decoded && decoded.project === oldProjectName) {
      next.add(encodeArchivedFileKey(newProjectName, decoded.file))
      changed = true
    } else {
      next.add(key)
    }
  }
  return changed ? next : archivedFiles
}

/**
 * Explicit same-commit cascade for a project delete (mirrors `deleteProject`
 * callers dropping `projectName` from `archivedProjects` inline): drops
 * every archived-file entry belonging to `projectName`. Functionally a
 * subset of what `pruneArchivedFiles` would also eventually catch, but
 * matches the existing belt-and-braces precedent of an explicit drop in the
 * same commit as the delete rather than waiting a tick for the prune effect.
 */
export function dropProjectFromArchivedFiles(
  archivedFiles: ReadonlySet<string>,
  projectName: string,
): ReadonlySet<string> {
  const next = new Set(
    [...archivedFiles].filter((key) => decodeArchivedFileKey(key)?.project !== projectName),
  )
  return next.size === archivedFiles.size ? archivedFiles : next
}

/**
 * Drops archived-file entries for files that no longer exist (deleted, or a
 * stale/malformed entry from a previous session) so the persisted set
 * doesn't accumulate garbage forever. Mirrors `pruneArchived`.
 */
export function pruneArchivedFiles(
  archivedFiles: ReadonlySet<string>,
  state: ProjectsState,
): ReadonlySet<string> {
  const next = new Set(
    [...archivedFiles].filter((key) => {
      const decoded = decodeArchivedFileKey(key)
      return decoded !== null && fileExists(state, decoded.project, decoded.file)
    }),
  )
  return next.size === archivedFiles.size ? archivedFiles : next
}
