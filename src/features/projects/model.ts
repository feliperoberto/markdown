// Pure, immutable CRUD operations over `ProjectsState`. No persistence or
// DOM concerns here — callers (e.g. `useProjects`) are responsible for
// persisting the returned state via the storage adapter.
import type { ProjectFile, ProjectFiles, ProjectsState } from './types'

export function projectExists(state: ProjectsState, projectName: string): boolean {
  return Object.prototype.hasOwnProperty.call(state, projectName)
}

export function fileExists(state: ProjectsState, projectName: string, fileName: string): boolean {
  return Boolean(state[projectName] && Object.prototype.hasOwnProperty.call(state[projectName], fileName))
}

export function createProject(state: ProjectsState, projectName: string): ProjectsState {
  if (!projectName || projectExists(state, projectName)) return state
  return { ...state, [projectName]: {} }
}

export function renameProject(state: ProjectsState, oldName: string, newName: string): ProjectsState {
  if (!newName || oldName === newName || !projectExists(state, oldName) || projectExists(state, newName)) {
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
  content = ''
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
  newFileName: string
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

export function deleteFile(state: ProjectsState, projectName: string, fileName: string): ProjectsState {
  if (!fileExists(state, projectName, fileName)) return state
  const files = { ...state[projectName] }
  delete files[fileName]
  return { ...state, [projectName]: files }
}

export function updateFileContent(
  state: ProjectsState,
  projectName: string,
  fileName: string,
  content: string
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

export function mergeProjects(base: ProjectsState, incoming: ProjectsState): ProjectsState {
  const next: ProjectsState = { ...base }
  for (const [projectName, files] of Object.entries(incoming)) {
    next[projectName] = { ...next[projectName], ...files }
  }
  return next
}

/**
 * Full-state replace, used for "restore from backup" flows (e.g. Drive
 * restore) where the incoming snapshot should reconcile local state, not
 * just layer additively on top of it (unlike `mergeProjects`, which is
 * for ZIP import and must remain additive).
 */
export function replaceProjects(incoming: ProjectsState): ProjectsState {
  return incoming
}
