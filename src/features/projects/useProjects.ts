import { useCallback, useState } from 'preact/hooks'
import * as model from './model'
import { loadProjects, saveProjects } from './storage'
import type { ProjectsState } from './types'

export interface UseProjectsResult {
  projects: ProjectsState
  currentProject: string | null
  currentFile: string | null
  selectFile: (projectName: string, fileName: string) => void
  clearSelection: () => void
  createProject: (name: string) => void
  renameProject: (oldName: string, newName: string) => void
  deleteProject: (name: string) => void
  createFile: (projectName: string, fileName: string, content?: string) => void
  renameFile: (projectName: string, oldFileName: string, newFileName: string) => void
  deleteFile: (projectName: string, fileName: string) => void
  updateFileContent: (projectName: string, fileName: string, content: string) => void
  importProjects: (incoming: ProjectsState) => void
  restoreProjects: (incoming: ProjectsState) => void
}

// Owns the projects/files state for the app and persists every mutation
// through the storage-adapter-backed `storage.ts` module (never `localStorage`
// directly). Consumers (sidebar rendering, editor, import/export, drive-sync)
// should drive all reads/writes through this hook.
export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectsState>(() => loadProjects())
  const [currentProject, setCurrentProject] = useState<string | null>(null)
  const [currentFile, setCurrentFile] = useState<string | null>(null)

  const persist = useCallback((next: ProjectsState) => {
    setProjects(next)
    saveProjects(next)
  }, [])

  const selectFile = useCallback((projectName: string, fileName: string) => {
    setCurrentProject(projectName)
    setCurrentFile(fileName)
  }, [])

  const clearSelection = useCallback(() => {
    setCurrentProject(null)
    setCurrentFile(null)
  }, [])

  const createProject = useCallback(
    (name: string) => {
      persist(model.createProject(projects, name))
      setCurrentProject(name)
    },
    [projects, persist]
  )

  const renameProject = useCallback(
    (oldName: string, newName: string) => {
      persist(model.renameProject(projects, oldName, newName))
      setCurrentProject((current) => (current === oldName ? newName : current))
    },
    [projects, persist]
  )

  const deleteProject = useCallback(
    (name: string) => {
      persist(model.deleteProject(projects, name))
      setCurrentProject((current) => (current === name ? null : current))
      setCurrentFile((file) => (currentProject === name ? null : file))
    },
    [projects, persist, currentProject]
  )

  const createFile = useCallback(
    (projectName: string, fileName: string, content = '') => {
      persist(model.createFile(projects, projectName, fileName, content))
    },
    [projects, persist]
  )

  const renameFile = useCallback(
    (projectName: string, oldFileName: string, newFileName: string) => {
      persist(model.renameFile(projects, projectName, oldFileName, newFileName))
      setCurrentFile((file) => (currentProject === projectName && file === oldFileName ? newFileName : file))
    },
    [projects, persist, currentProject]
  )

  const deleteFile = useCallback(
    (projectName: string, fileName: string) => {
      persist(model.deleteFile(projects, projectName, fileName))
      if (currentProject === projectName && currentFile === fileName) {
        setCurrentFile(null)
      }
    },
    [projects, persist, currentProject, currentFile]
  )

  const updateFileContent = useCallback(
    (projectName: string, fileName: string, content: string) => {
      persist(model.updateFileContent(projects, projectName, fileName, content))
    },
    [projects, persist]
  )

  const importProjects = useCallback(
    (incoming: ProjectsState) => {
      persist(model.mergeProjects(projects, incoming))
    },
    [projects, persist]
  )

  // Full-state replace for "restore from backup" (e.g. Drive restore) —
  // distinct from `importProjects`'s additive ZIP-import merge semantics.
  const restoreProjects = useCallback(
    (incoming: ProjectsState) => {
      persist(model.replaceProjects(incoming))
    },
    [persist]
  )

  return {
    projects,
    currentProject,
    currentFile,
    selectFile,
    clearSelection,
    createProject,
    renameProject,
    deleteProject,
    createFile,
    renameFile,
    deleteFile,
    updateFileContent,
    importProjects,
    restoreProjects,
  }
}
