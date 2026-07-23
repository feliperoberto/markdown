// Pure, immutable CRUD operations over `ProjectsState`. No persistence or
// DOM concerns here — callers (e.g. `useProjects`) are responsible for
// persisting the returned state via the storage adapter.
import type { ProjectFile, ProjectFiles, ProjectsState } from './types'

export function projectExists(state: ProjectsState, projectName: string): boolean {
  return Object.prototype.hasOwnProperty.call(state, projectName)
}

/**
 * First file in the first project that has one, in insertion order (issue
 * #92: focus a real file on init so typing edits something). Skips empty
 * projects so "the first project with the first file" resolves to the
 * first project that actually contains a file. Returns `null` only when no
 * project holds any file.
 */
export function firstFileOf(state: ProjectsState): { project: string; file: string } | null {
  for (const project of Object.keys(state)) {
    const files = Object.keys(state[project] ?? {})
    if (files.length > 0) return { project, file: files[0]! }
  }
  return null
}

export function fileExists(state: ProjectsState, projectName: string, fileName: string): boolean {
  return Boolean(
    state[projectName] && Object.prototype.hasOwnProperty.call(state[projectName], fileName),
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
 * Known limitation, same as `mergeRestoredProjects`: no tombstones. A file
 * deleted on one side but still present in the other's last-synced
 * snapshot reappears after merging — this function has no way to
 * distinguish "never existed there" from "existed and was deleted".
 */
export function mergeProjectsByFreshness(
  local: ProjectsState,
  remote: ProjectsState,
): FreshnessMergeResult {
  const merged: ProjectsState = {}
  let localChanged = false
  let remoteChanged = false

  const projectNames = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const projectName of projectNames) {
    const localFiles = local[projectName] ?? {}
    const remoteFiles = remote[projectName] ?? {}
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
        files[fileName] = remoteFile
        localChanged = true
      }
    }

    merged[projectName] = files
  }

  return { merged, localChanged, remoteChanged }
}
