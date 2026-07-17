import { useCallback, useState } from 'preact/hooks'
import * as model from './model'
import { backupProjects, loadProjects, saveProjects } from './storage'
import { normalizeProjectsState } from './validate'
import type { ProjectsState } from './types'
import { useToast } from '@/components'

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
  // Accepts `unknown` (not `ProjectsState`) because the caller's source is
  // untrusted external data (a Drive pull) — normalizeProjectsState
  // validates the shape internally rather than the caller casting past
  // the type system before this even sees it. Returns the merged result
  // (always, even when only the remote side needed catching up) so the
  // caller can push it straight back without a second round-trip.
  reconcileWithRemote: (remote: unknown) => ProjectsState
}

// Owns the projects/files state for the app and persists every mutation
// through the storage-adapter-backed `storage.ts` module (never `localStorage`
// directly). Consumers (sidebar rendering, editor, import/export, drive-sync)
// should drive all reads/writes through this hook.
export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectsState>(() => loadProjects())
  const [currentProject, setCurrentProject] = useState<string | null>(null)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const showToast = useToast()

  // Persists first, then updates in-memory state only on success. Previously
  // `setProjects` ran unconditionally and `saveProjects` was never guarded,
  // so a QuotaExceededError (a large save, or Safari private-mode's
  // zero-quota setItem) threw uncaught: the UI already showed the new
  // content as if it had saved, while storage silently kept the old state
  // - a save that looked successful but wasn't. Persisting before updating
  // state means the editor never displays content that didn't actually
  // reach storage; the previous, genuinely-saved state stays visible
  // instead, alongside the error toast.
  const persist = useCallback(
    (next: ProjectsState) => {
      try {
        saveProjects(next)
      } catch (error) {
        console.error('Failed to save projects.', error)
        showToast(`Erro ao salvar: ${(error as Error)?.message ?? 'armazenamento cheio'}`, 'error')
        return
      }
      setProjects(next)
    },
    [showToast],
  )

  const selectFile = useCallback((projectName: string, fileName: string) => {
    setCurrentProject(projectName)
    setCurrentFile(fileName)
  }, [])

  const clearSelection = useCallback(() => {
    setCurrentProject(null)
    setCurrentFile(null)
  }, [])

  // CRUD toasts (create/rename/delete) were dropped in the migration —
  // the prototype fired one on every mutation ("✅ Projeto criado",
  // "🗑 Arquivo excluído", etc.) and existing users expect that feedback;
  // a silent state change reads as "did that actually work?".
  const createProject = useCallback(
    (name: string) => {
      persist(model.createProject(projects, name))
      setCurrentProject(name)
      showToast('✅ Projeto criado', 'success')
    },
    [projects, persist, showToast],
  )

  const renameProject = useCallback(
    (oldName: string, newName: string) => {
      persist(model.renameProject(projects, oldName, newName))
      setCurrentProject((current) => (current === oldName ? newName : current))
      showToast('✅ Projeto renomeado', 'success')
    },
    [projects, persist, showToast],
  )

  const deleteProject = useCallback(
    (name: string) => {
      backupProjects(projects)
      persist(model.deleteProject(projects, name))
      // Both updaters read the same functional-update mechanism so they
      // can't disagree about whether `name` was the active project —
      // previously `setCurrentFile` compared against the closed-over
      // `currentProject` instead of fresh state, which could leave
      // `currentFile` pointing at a file in the just-deleted project if
      // this ran again before a re-render refreshed the closure.
      let wasCurrentProject = false
      setCurrentProject((current) => {
        wasCurrentProject = current === name
        return wasCurrentProject ? null : current
      })
      setCurrentFile((file) => (wasCurrentProject ? null : file))
      showToast('🗑 Projeto excluído', 'success')
    },
    [projects, persist, showToast],
  )

  const createFile = useCallback(
    (projectName: string, fileName: string, content = '') => {
      persist(model.createFile(projects, projectName, fileName, content))
      showToast('✅ Novo arquivo', 'success')
    },
    [projects, persist, showToast],
  )

  const renameFile = useCallback(
    (projectName: string, oldFileName: string, newFileName: string) => {
      persist(model.renameFile(projects, projectName, oldFileName, newFileName))
      setCurrentFile((file) =>
        currentProject === projectName && file === oldFileName ? newFileName : file,
      )
      showToast('✅ Arquivo renomeado', 'success')
    },
    [projects, persist, currentProject, showToast],
  )

  const deleteFile = useCallback(
    (projectName: string, fileName: string) => {
      backupProjects(projects)
      persist(model.deleteFile(projects, projectName, fileName))
      if (currentProject === projectName && currentFile === fileName) {
        setCurrentFile(null)
      }
      showToast('🗑 Arquivo excluído', 'success')
    },
    [projects, persist, currentProject, currentFile, showToast],
  )

  const updateFileContent = useCallback(
    (projectName: string, fileName: string, content: string) => {
      persist(model.updateFileContent(projects, projectName, fileName, content))
    },
    [projects, persist],
  )

  const importProjects = useCallback(
    (incoming: ProjectsState) => {
      // ZIP import can silently overwrite existing files with same-named
      // incoming ones (see `model.mergeProjects`), so back up first.
      backupProjects(projects)
      persist(model.mergeProjects(projects, incoming))
    },
    [projects, persist],
  )

  // Smart-sync reconciliation: merges a just-pulled remote snapshot into
  // local state by per-file freshness (newer `timestamp` wins; files
  // unique to either side are always kept) instead of blindly favoring
  // one side — see `model.mergeProjectsByFreshness`. `remote` is
  // untrusted external data (a Drive pull, possibly hand-edited or
  // written by a different schema version), so it's normalized first:
  // malformed projects/files are dropped, names are structurally
  // sanitized, and `file.name`/`size` are recomputed rather than trusted.
  // Always returns the merged result — even when only the remote side
  // needed catching up — so the caller (the Drive sync panel) can push it
  // straight back without a second pull/merge round-trip.
  const reconcileWithRemote = useCallback(
    (remote: unknown) => {
      backupProjects(projects)
      const { merged, localChanged } = model.mergeProjectsByFreshness(
        projects,
        normalizeProjectsState(remote),
      )
      if (localChanged) persist(merged)
      return merged
    },
    [projects, persist],
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
    reconcileWithRemote,
  }
}
