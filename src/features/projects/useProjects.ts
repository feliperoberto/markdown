import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import * as model from './model'
import {
  backupProjects,
  loadLastEditedFile,
  loadProjects,
  saveLastEditedFile,
  saveProjects,
} from './storage'
import { normalizeProjectsState } from './validate'
import type { ProjectsState } from './types'
import { useToast } from '@/components'

// Resolves which file to open on mount (issue #92): the last-edited file
// if it's still present, otherwise the first available file. `null` only
// when there are no files at all. Reads the persisted pointer once and
// validates it against live state, so a stale pointer (file since deleted
// or renamed) falls back gracefully instead of selecting nothing.
function resolveInitialSelection(projects: ProjectsState): {
  project: string | null
  file: string | null
} {
  const last = loadLastEditedFile()
  if (last && projects[last.project]?.[last.file]) {
    return { project: last.project, file: last.file }
  }
  const first = model.firstFileOf(projects)
  return { project: first?.project ?? null, file: first?.file ?? null }
}

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
  // Drag & drop (issue #92). `moveFile` reorders within a project or moves
  // across projects (append when `beforeFile` is null); `moveProject`
  // reorders the top-level project list (append when `beforeProject` is null).
  moveFile: (
    fromProject: string,
    fileName: string,
    toProject: string,
    beforeFile?: string | null,
  ) => void
  moveProject: (projectName: string, beforeProject?: string | null) => void
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
  // Load projects and resolve the initial selection together, exactly once,
  // so both derive from the same first read (loadProjects() seeds a default
  // project on genuine first run — see storage.ts).
  const initialRef = useRef<{
    projects: ProjectsState
    selection: { project: string | null; file: string | null }
  } | null>(null)
  if (initialRef.current === null) {
    const loaded = loadProjects()
    initialRef.current = { projects: loaded, selection: resolveInitialSelection(loaded) }
  }

  const [projects, setProjects] = useState<ProjectsState>(initialRef.current.projects)
  const [currentProject, setCurrentProject] = useState<string | null>(
    initialRef.current.selection.project,
  )
  const [currentFile, setCurrentFile] = useState<string | null>(initialRef.current.selection.file)
  const showToast = useToast()

  // Remember the open file across visits (issue #92). Runs on every
  // selection change — including the setCurrentFile updates that rename/
  // delete trigger — so the persisted pointer always tracks live state
  // (cleared when nothing is selected).
  useEffect(() => {
    saveLastEditedFile(
      currentProject && currentFile ? { project: currentProject, file: currentFile } : null,
    )
  }, [currentProject, currentFile])

  // Persists first, then updates in-memory state only on success. Previously
  // `setProjects` ran unconditionally and `saveProjects` was never guarded,
  // so a QuotaExceededError (a large save, or Safari private-mode's
  // zero-quota setItem) threw uncaught: the UI already showed the new
  // content as if it had saved, while storage silently kept the old state
  // - a save that looked successful but wasn't. Persisting before updating
  // state means the editor never displays content that didn't actually
  // reach storage; the previous, genuinely-saved state stays visible
  // instead, alongside the error toast.
  // Returns whether the write succeeded, so a caller that also updates
  // selection state (e.g. `moveFile` following the active file into its new
  // project) can skip that update when the persist failed — otherwise the
  // selection would point at state that never reached storage.
  const persist = useCallback(
    (next: ProjectsState): boolean => {
      try {
        saveProjects(next)
      } catch (error) {
        console.error('Failed to save projects.', error)
        showToast(`Erro ao salvar: ${(error as Error)?.message ?? 'armazenamento cheio'}`, 'error')
        return false
      }
      setProjects(next)
      return true
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

  const moveFile = useCallback(
    (
      fromProject: string,
      fileName: string,
      toProject: string,
      beforeFile: string | null = null,
    ) => {
      // Explain the one rejection a user can trigger but not see: moving a
      // file into another project that already has a same-named file. The
      // model refuses it (never overwrites), and without this the drop just
      // silently does nothing.
      if (fromProject !== toProject && model.fileExists(projects, toProject, fileName)) {
        showToast(`Já existe um arquivo "${fileName}" em "${toProject}".`, 'warning')
        return
      }
      const next = model.moveFile(projects, fromProject, fileName, toProject, beforeFile)
      // Same reference back means the move was a no-op (e.g. dropping a file
      // onto itself) — nothing to persist.
      if (next === projects) return
      // Only follow the active file into its new project if the write
      // actually reached storage; on a persist failure the file is still in
      // its old project, so moving the selection would point the editor at a
      // file that isn't there.
      const saved = persist(next)
      if (saved) {
        setCurrentProject((current) =>
          current === fromProject && currentFile === fileName ? toProject : current,
        )
      }
    },
    [projects, persist, currentFile, showToast],
  )

  const moveProject = useCallback(
    (projectName: string, beforeProject: string | null = null) => {
      const next = model.moveProject(projects, projectName, beforeProject)
      if (next === projects) return
      persist(next)
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
    moveFile,
    moveProject,
    importProjects,
    reconcileWithRemote,
  }
}
