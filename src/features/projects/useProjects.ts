import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import * as model from './model'
import {
  backupProjects,
  loadArchivedFiles,
  loadArchivedProjects,
  loadLastEditedFile,
  loadProjects,
  loadTombstones,
  saveArchivedFiles,
  saveArchivedProjects,
  saveLastEditedFile,
  saveProjects,
  saveTombstones,
} from './storage'
import {
  clearFileTombstone,
  clearProjectTombstone,
  mergeTombstones,
  normalizeTombstones,
  pruneTombstones,
  recordFileTombstone,
  recordProjectTombstone,
  type Tombstones,
} from './tombstones'
import { normalizeProjectsState } from './validate'
import type { ProjectsState } from './types'
import { useToast } from '@/components'

// A tombstone only needs to outlive the longest plausible gap between two
// devices syncing — not the life of the app — so the sidecar doesn't grow
// forever. Generous on purpose: a device that's been offline for weeks
// should still have its deletions propagate correctly on reconnect.
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000

// Resolves which file to open on mount (issue #92): the last-edited file if
// it's still present, otherwise the first available file. `null` only when
// there are no files at all. Reads the persisted pointer once and validates
// it against live state, so a stale pointer (file since deleted or renamed)
// falls back gracefully instead of selecting nothing.
//
// Archive feature: a last-edited file inside an archived project, or a last-
// edited file individually archived, is treated as absent — reopening
// content the user just hid would be a worse surprise than picking the next
// visible file — and the first-file fallback also skips both. If literally
// everything is archived, fall back progressively (project-filtered only,
// then fully unfiltered) rather than leaving the editor on nothing: a
// breadcrumb naming archived content is better than a blank editor with no
// obvious next action.
function resolveInitialSelection(
  projects: ProjectsState,
  archivedProjects: ReadonlySet<string>,
  archivedFiles: ReadonlySet<string>,
): {
  project: string | null
  file: string | null
} {
  const last = loadLastEditedFile()
  if (
    last &&
    !archivedProjects.has(last.project) &&
    !model.isFileArchived(archivedFiles, last.project, last.file) &&
    projects[last.project]?.[last.file]
  ) {
    return { project: last.project, file: last.file }
  }
  const first =
    model.firstFileOf(projects, archivedProjects, archivedFiles) ??
    model.firstFileOf(projects, archivedProjects) ??
    model.firstFileOf(projects)
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
  createFile: (
    projectName: string,
    fileName: string,
    content?: string,
    options?: { select?: boolean },
  ) => void
  // Batch create, folded into a single persist() call — unlike calling
  // `createFile` once per entry in a loop with `await`s between calls
  // (e.g. importing several files), which reads a stale pre-loop
  // `projects` snapshot on every iteration and silently loses every entry
  // but the last (see CHANGELOG's "Fixed" note on multi-file import).
  // Never selects (matches the existing `{ select: false }` convention for
  // multi-file callers). Returns how many entries actually got created,
  // since a name colliding with an existing or earlier-in-this-batch file
  // is silently skipped, same as a single createFile refusal.
  createFiles: (
    projectName: string,
    entries: ReadonlyArray<{ name: string; content: string }>,
  ) => number
  renameFile: (projectName: string, oldFileName: string, newFileName: string) => void
  deleteFile: (projectName: string, fileName: string) => void
  updateFileContent: (projectName: string, fileName: string, content: string) => void
  // Drag & drop (issue #92). `moveFile` reorders a file within its project
  // (append when `beforeFile` is null); `moveProject` reorders the
  // top-level project list (append when `beforeProject` is null).
  moveFile: (projectName: string, fileName: string, beforeFile?: string | null) => void
  moveProject: (projectName: string, beforeProject?: string | null) => void
  // Archive feature: names of projects currently hidden from the everyday
  // list. Device-local (see storage.ts's ARCHIVED_PROJECTS_KEY comment) —
  // not part of `projects`, so it never travels through Drive sync.
  archivedProjects: ReadonlySet<string>
  /** Flips a project's archived state (archive if visible, unarchive if archived). */
  toggleProjectArchived: (projectName: string) => void
  // Archive feature (files): composite `(project, file)` keys currently
  // hidden from their project's everyday file list — see model.ts's
  // encodeArchivedFileKey. Same device-local reasoning as archivedProjects.
  archivedFiles: ReadonlySet<string>
  /** Flips a file's archived state (archive if visible, unarchive if archived). */
  toggleFileArchived: (projectName: string, fileName: string) => void
  importProjects: (incoming: ProjectsState) => void
  // Accepts `unknown` (not `ProjectsState`/`Tombstones`) because the
  // caller's source is untrusted external data (a Drive pull) —
  // normalizeProjectsState/normalizeTombstones validate the shape
  // internally rather than the caller casting past the type system before
  // this even sees it. Returns the merged result (always, even when only
  // the remote side needed catching up) so the caller can push it straight
  // back without a second round-trip; the returned tombstones are the
  // combined set (local + remote, latest `deletedAt` wins), which the
  // caller must push alongside `projects` for a deletion to actually
  // propagate to a device that hasn't seen it yet.
  reconcileWithRemote: (
    remote: unknown,
    remoteTombstones?: unknown,
  ) => { projects: ProjectsState; tombstones: Tombstones }
}

// Owns the projects/files state for the app and persists every mutation
// through the storage-adapter-backed `storage.ts` module (never `localStorage`
// directly). Consumers (sidebar rendering, editor, import/export, drive-sync)
// should drive all reads/writes through this hook.
export function useProjects(): UseProjectsResult {
  // Load projects and resolve the initial selection together, exactly once,
  // so both derive from the same first read (loadProjects() seeds a default
  // project on genuine first run — see storage.ts). The archived set is
  // loaded here too since resolveInitialSelection needs it before first
  // render, and pruned against the freshly loaded projects immediately
  // (same reasoning as ProjectsSidebar's collapsed-set pruning).
  const initialRef = useRef<{
    projects: ProjectsState
    archived: Set<string>
    archivedFiles: Set<string>
    tombstones: Tombstones
    selection: { project: string | null; file: string | null }
  } | null>(null)
  if (initialRef.current === null) {
    const loaded = loadProjects()
    const archived = new Set(model.pruneArchived(loadArchivedProjects(), loaded))
    const archivedFiles = new Set(model.pruneArchivedFiles(loadArchivedFiles(), loaded))
    const tombstones = pruneTombstones(loadTombstones(), new Date().toISOString(), TOMBSTONE_TTL_MS)
    initialRef.current = {
      projects: loaded,
      archived,
      archivedFiles,
      tombstones,
      selection: resolveInitialSelection(loaded, archived, archivedFiles),
    }
  }

  const [projects, setProjects] = useState<ProjectsState>(initialRef.current.projects)
  const [currentProject, setCurrentProject] = useState<string | null>(
    initialRef.current.selection.project,
  )
  const [currentFile, setCurrentFile] = useState<string | null>(initialRef.current.selection.file)
  const [archivedProjects, setArchivedProjects] = useState<Set<string>>(initialRef.current.archived)
  const [archivedFiles, setArchivedFiles] = useState<Set<string>>(initialRef.current.archivedFiles)
  // Rename/delete tombstones (issue: a renamed or deleted file/project
  // reappearing as a duplicate after Drive sync) — see tombstones.ts and
  // model.mergeProjectsByFreshness's `tombstones` param, the only place
  // this is actually read.
  const [tombstones, setTombstones] = useState<Tombstones>(initialRef.current.tombstones)
  const showToast = useToast()

  // Write-through persistence for the archived set, mirroring
  // ProjectsSidebar's collapsedProjects effect. Best-effort (see
  // saveArchivedProjects) — losing this never risks a document.
  useEffect(() => {
    saveArchivedProjects(archivedProjects)
  }, [archivedProjects])

  // Drop archived entries for projects that no longer exist (deleted, or a
  // stale name from a previous session that outlived a hand-edited/older
  // localStorage value) so the persisted set doesn't accumulate garbage.
  useEffect(() => {
    setArchivedProjects((prev) => {
      const next = model.pruneArchived(prev, projects)
      return next === prev ? prev : new Set(next)
    })
  }, [projects])

  // Write-through persistence for the archived-files set, mirroring the
  // archivedProjects effect above.
  useEffect(() => {
    saveArchivedFiles(archivedFiles)
  }, [archivedFiles])

  // Drop archived-file entries for files that no longer exist, mirroring
  // the archivedProjects prune effect above.
  useEffect(() => {
    setArchivedFiles((prev) => {
      const next = model.pruneArchivedFiles(prev, projects)
      return next === prev ? prev : new Set(next)
    })
  }, [projects])

  // Write-through persistence for tombstones, mirroring the archived-files
  // effect above — best-effort, since losing this only risks a rename/
  // delete not propagating to Drive, never local data.
  useEffect(() => {
    saveTombstones(tombstones)
  }, [tombstones])

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
      // A brand-new project has no files, so clear any previously-selected
      // file — otherwise `currentFile` keeps pointing at the old project's
      // file and the breadcrumb renders a mismatched "NewProject / oldFile"
      // pair. Harmless when nothing was selected; only matters now that a
      // file can be pre-selected on init (issue #92).
      setCurrentFile(null)
      // Belt-and-braces, same reasoning as createFile's clearFileTombstone:
      // if this exact name was deleted (or renamed away from) earlier and
      // still carries a tombstone, drop it so a brand-new, still-empty
      // project of the same name doesn't stay shadowed by stale deletion
      // history the next time it's synced.
      setTombstones((prev) => clearProjectTombstone(prev, name))
      showToast('✅ Projeto criado', 'success')
    },
    [projects, persist, showToast],
  )

  const renameProject = useCallback(
    (oldName: string, newName: string) => {
      const next = model.renameProject(projects, oldName, newName)
      // Same reference back means the rename was a no-op (e.g. `newName`
      // already exists) — model.renameProject refuses those rather than
      // overwriting. Bailing out here, before persist()/the cascades below,
      // matters specifically because `persist()` reports success whenever
      // the WRITE succeeds, not whenever the state actually changed: it
      // would happily re-save the identical `projects` object and report
      // `saved = true`, which previously made the archived-flag cascades
      // below carry a project's archived files onto a *different*,
      // unrelated project of that same (rejected) target name.
      if (next === projects) return
      // Gated on the write actually landing — same precedent as moveFile
      // only following the active file into its new project when
      // persist() succeeded. Previously this ran unconditionally, so a
      // failed save (e.g. quota exceeded) left currentProject pointing at
      // newName while `projects` still had the file under oldName.
      const saved = persist(next)
      if (saved) {
        setCurrentProject((current) => (current === oldName ? newName : current))
        // Carry the archived flag across the key move — project identity is
        // the object key, so without this a renamed archived project would
        // silently reappear in the everyday list.
        setArchivedProjects((prev) => {
          const next = model.renameInArchived(prev, oldName, newName)
          return next === prev ? prev : new Set(next)
        })
        // Same reasoning, one level down: every archived file inside this
        // project has a composite key pointing at the old project name.
        setArchivedFiles((prev) => {
          const next = model.renameProjectInArchivedFiles(prev, oldName, newName)
          return next === prev ? prev : new Set(next)
        })
        // A rename is a key move (project identity is the object key) — the
        // old key survives in Drive until the next sync tells it otherwise,
        // and without a tombstone `mergeProjectsByFreshness` would resurrect
        // it as a duplicate the next time it's pulled. See tombstones.ts.
        //
        // The project-level tombstone alone only protects this exact name
        // from resurrecting while it stays absent locally
        // (`mergeProjectsByFreshness` only consults it via
        // `!projectExists(local, projectName)`) — it does nothing once
        // `oldName` exists locally again, e.g. because it was reused for an
        // unrelated new/renamed-into project before the next sync. Also
        // tombstoning every individual file that lived under `oldName`
        // closes that gap: those file-level tombstones are what stop the
        // old project's files from being merged into a same-named
        // replacement, exactly like an ordinary per-file rename does.
        const deletedAt = new Date().toISOString()
        const movedFileNames = Object.keys(projects[oldName] ?? {})
        setTombstones((prev) => {
          let result = clearProjectTombstone(prev, newName)
          result = recordProjectTombstone(result, oldName, deletedAt)
          for (const fileName of movedFileNames) {
            result = clearFileTombstone(result, newName, fileName)
            result = recordFileTombstone(result, oldName, fileName, deletedAt)
          }
          return result
        })
      }
      showToast('✅ Projeto renomeado', 'success')
    },
    [projects, persist, showToast],
  )

  const deleteProject = useCallback(
    (name: string) => {
      backupProjects(projects)
      const next = model.deleteProject(projects, name)
      const saved = persist(next)
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
      // Explicit drop in the same commit as the delete, rather than relying
      // solely on the prune effect (belt-and-braces — see that effect).
      // Gated on the write actually landing — otherwise a failed delete
      // (e.g. quota exceeded) still un-archives a project that was never
      // actually removed from `projects`, and it silently reappears in the
      // everyday list on the next render.
      if (saved && next !== projects) {
        setArchivedProjects((prev) => {
          if (!prev.has(name)) return prev
          const next = new Set(prev)
          next.delete(name)
          return next
        })
        // Same reasoning, one level down: drop every archived-file entry
        // that belonged to this now-deleted project.
        setArchivedFiles((prev) => {
          const next = model.dropProjectFromArchivedFiles(prev, name)
          return next === prev ? prev : new Set(next)
        })
        // Same reasoning as renameProject's tombstone: without it, a Drive
        // pull that still has this project (not yet told about the
        // deletion) would resurrect it via mergeProjectsByFreshness's union.
        //
        // Also tombstones every file that was in the project, one level
        // down — same reasoning as renameProject's identical addition: the
        // project-level tombstone alone stops protecting this name the
        // moment it exists locally again (e.g. recreated, or another
        // project renamed into it, before the next sync), and without a
        // per-file tombstone the deleted project's old files would merge
        // straight into whatever now occupies that name.
        const deletedAt = new Date().toISOString()
        const deletedFileNames = Object.keys(projects[name] ?? {})
        setTombstones((prev) => {
          let result = recordProjectTombstone(prev, name, deletedAt)
          for (const fileName of deletedFileNames) {
            result = recordFileTombstone(result, name, fileName, deletedAt)
          }
          return result
        })
      }
      showToast('🗑 Projeto excluído', 'success')
    },
    [projects, persist, showToast],
  )

  // Archive feature: flips a project's archived state. Reversible, so
  // unlike delete this needs no confirm and no backup — no project data is
  // touched, only the sidecar visibility set.
  const toggleProjectArchived = useCallback(
    (projectName: string) => {
      const willArchive = !archivedProjects.has(projectName)
      // Functional form, matching every other writer of this state
      // (renameProject/deleteProject/the prune effect) — guards against a
      // second toggle in the same tick overwriting this one instead of
      // building on it.
      setArchivedProjects((prev) => {
        const next = new Set(prev)
        if (willArchive) next.add(projectName)
        else next.delete(projectName)
        return next
      })

      // Archiving the project whose file is open: move the selection to the
      // first file of the first still-visible project rather than leaving
      // the editor open on a project that just vanished from the tree. If
      // that was the last visible project, fall back to the unfiltered
      // first file — same "don't leave the editor on nothing" reasoning as
      // resolveInitialSelection's boot-time fallback — rather than nulling
      // out the selection. Content is already persisted per keystroke, so
      // nothing is lost by moving the selection.
      if (willArchive && currentProject === projectName) {
        const projectedArchived = new Set(archivedProjects)
        projectedArchived.add(projectName)
        // Same progressive fallback as resolveInitialSelection/
        // toggleFileArchived: skip individually-archived files too before
        // falling back to the fully unfiltered first file — otherwise this
        // could land the selection on a file that's itself archived (hidden
        // behind its own project's "Mostrar arquivados" toggler), silently
        // reopening content the user hid.
        const target =
          model.firstFileOf(projects, projectedArchived, archivedFiles) ??
          model.firstFileOf(projects, projectedArchived) ??
          model.firstFileOf(projects)
        setCurrentProject(target?.project ?? null)
        setCurrentFile(target?.file ?? null)
      }
      showToast(willArchive ? '📦 Projeto arquivado' : '📂 Projeto desarquivado', 'success')
    },
    [archivedProjects, archivedFiles, projects, currentProject, showToast],
  )

  // Archive feature (files): flips one file's archived state. Same
  // reversible, no-confirm/no-backup posture as toggleProjectArchived — only
  // the sidecar visibility set is touched, never file content.
  const toggleFileArchived = useCallback(
    (projectName: string, fileName: string) => {
      const key = model.encodeArchivedFileKey(projectName, fileName)
      const willArchive = !archivedFiles.has(key)
      setArchivedFiles((prev) => {
        const next = new Set(prev)
        if (willArchive) next.add(key)
        else next.delete(key)
        return next
      })

      // Archiving the file that's currently open: prefer moving selection to
      // a sibling file within the same project (closer, less surprising
      // than jumping to an arbitrary other project) before falling through
      // to the global first-file fallback, same "don't leave the editor on
      // nothing" reasoning as toggleProjectArchived.
      if (willArchive && currentProject === projectName && currentFile === fileName) {
        const projectedArchived = new Set(archivedFiles)
        projectedArchived.add(key)
        const sibling = Object.keys(projects[projectName] ?? {}).find(
          (name) =>
            name !== fileName && !model.isFileArchived(projectedArchived, projectName, name),
        )
        if (sibling) {
          setCurrentFile(sibling)
        } else {
          const target =
            model.firstFileOf(projects, archivedProjects, projectedArchived) ??
            model.firstFileOf(projects, archivedProjects) ??
            model.firstFileOf(projects)
          setCurrentProject(target?.project ?? null)
          setCurrentFile(target?.file ?? null)
        }
      }
      showToast(willArchive ? '📦 Arquivo arquivado' : '📂 Arquivo desarquivado', 'success')
    },
    [archivedFiles, archivedProjects, projects, currentProject, currentFile, showToast],
  )

  const createFile = useCallback(
    (projectName: string, fileName: string, content = '', options?: { select?: boolean }) => {
      const next = model.createFile(projects, projectName, fileName, content)
      // Same reference back means the model refused (unknown project, empty
      // or duplicate name) — nothing to persist, and no toast for a create
      // that didn't happen.
      if (next === projects) return
      // Gated on the write actually landing — same precedent as every
      // other mutator here. Previously this ran unconditionally and
      // discarded persist()'s return value, so the success toast fired
      // even when the save failed (persist() already shows its own error
      // toast in that case).
      if (!persist(next)) return
      // A new file becomes the active one by default — matching
      // createProject below — so it's immediately visible instead of
      // leaving the editor on whatever was open before. Multi-file
      // callers (e.g. importing several files at once) opt out with
      // `{ select: false }` so selection doesn't jump to whichever
      // file happened to import last.
      if (options?.select !== false) {
        setCurrentProject(projectName)
        setCurrentFile(fileName)
      }
      // Belt-and-braces (see tombstones.ts's clearFileTombstone doc
      // comment): if this name was deleted earlier and still carries a
      // tombstone, drop it so the sidecar doesn't keep a stale entry for a
      // key that's live again.
      setTombstones((prev) => clearFileTombstone(prev, projectName, fileName))
      showToast('✅ Novo arquivo', 'success')
    },
    [projects, persist, showToast],
  )

  const createFiles = useCallback(
    (projectName: string, entries: ReadonlyArray<{ name: string; content: string }>): number => {
      // Folds every entry into one running `next` value and persists once
      // at the end — not one `createFile` call per entry — precisely so a
      // caller looping over several `await`-separated imports isn't
      // silently discarding all but the last one (see this function's own
      // doc comment above).
      let next: ProjectsState = projects
      const createdNames: string[] = []
      for (const entry of entries) {
        const candidate = model.createFile(next, projectName, entry.name, entry.content)
        if (candidate === next) continue
        next = candidate
        createdNames.push(entry.name)
      }
      if (createdNames.length === 0) return 0
      if (!persist(next)) return 0
      setTombstones((prev) => {
        let result = prev
        for (const name of createdNames) result = clearFileTombstone(result, projectName, name)
        return result
      })
      return createdNames.length
    },
    [projects, persist],
  )

  const renameFile = useCallback(
    (projectName: string, oldFileName: string, newFileName: string) => {
      const next = model.renameFile(projects, projectName, oldFileName, newFileName)
      // Same reference back means the rename was a no-op (e.g. `newFileName`
      // already exists in this project) — same reasoning as renameProject's
      // identical guard above: without bailing out here, persist() would
      // report success for a write that changed nothing, and the archived-
      // flag cascade below would still rekey the archived flag onto the
      // rejected target name.
      if (next === projects) return
      const saved = persist(next)
      if (saved) {
        setCurrentFile((file) =>
          currentProject === projectName && file === oldFileName ? newFileName : file,
        )
        // Carry the archived flag across the key move — same reasoning as
        // renameProject's renameInArchived call, one level down.
        setArchivedFiles((prev) => {
          const next = model.renameFileInArchivedFiles(prev, projectName, oldFileName, newFileName)
          return next === prev ? prev : new Set(next)
        })
        // Same reasoning as renameProject's tombstone, one level down: a
        // rename is a key move, so the old (project, oldFileName) key
        // survives in Drive until the next sync — without a tombstone it
        // resurrects as a duplicate (the reported bug this fixes).
        const deletedAt = new Date().toISOString()
        setTombstones((prev) => {
          const cleared = clearFileTombstone(prev, projectName, newFileName)
          return recordFileTombstone(cleared, projectName, oldFileName, deletedAt)
        })
      }
      showToast('✅ Arquivo renomeado', 'success')
    },
    [projects, persist, currentProject, showToast],
  )

  const deleteFile = useCallback(
    (projectName: string, fileName: string) => {
      backupProjects(projects)
      const next = model.deleteFile(projects, projectName, fileName)
      const saved = persist(next)
      if (currentProject === projectName && currentFile === fileName) {
        setCurrentFile(null)
      }
      // Explicit drop in the same commit as the delete, mirroring
      // deleteProject's inline archivedProjects drop. Gated on the write
      // actually landing — otherwise a failed delete still un-archives a
      // file that was never actually removed.
      if (saved && next !== projects) {
        const key = model.encodeArchivedFileKey(projectName, fileName)
        setArchivedFiles((prev) => {
          if (!prev.has(key)) return prev
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        // Same reasoning as renameFile's tombstone: without it, a Drive
        // pull that still has this file (not yet told about the deletion)
        // would resurrect it via mergeProjectsByFreshness's union.
        setTombstones((prev) =>
          recordFileTombstone(prev, projectName, fileName, new Date().toISOString()),
        )
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

  // Reorders a file within its own project (issue #92: drag & drop).
  // Moving a file to a DIFFERENT project was removed — see CHANGELOG — so
  // this is a pure reorder: no collision toast (a project can't collide
  // with itself), no active-file-follow (the project never changes), no
  // archived-flag rekey and no tombstone (both existed only to carry a
  // file's identity across a project boundary a move can no longer cross).
  const moveFile = useCallback(
    (projectName: string, fileName: string, beforeFile: string | null = null) => {
      const next = model.moveFile(projects, projectName, fileName, beforeFile)
      // Same reference back means the move was a no-op (e.g. dropping a
      // file onto itself) — nothing to persist.
      if (next === projects) return
      persist(next)
    },
    [projects, persist],
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
  // one side — see `model.mergeProjectsByFreshness`. `remote`/
  // `remoteTombstones` are untrusted external data (a Drive pull, possibly
  // hand-edited or written by a different schema version), so both are
  // normalized first: malformed projects/files are dropped, names are
  // structurally sanitized, `file.name`/`size` are recomputed rather than
  // trusted, and tombstone entries that don't decode or parse as an ISO
  // timestamp are dropped. Tombstones from both sides are combined (latest
  // `deletedAt` wins per key) before merging, so a deletion recorded on
  // either device — this one or whichever last pushed — is what suppresses
  // a stale remote-only entry from resurrecting; see model.
  // mergeProjectsByFreshness's `tombstones` param, the actual fix for a
  // renamed/deleted file or project reappearing as a duplicate after sync.
  // Always returns the merged result — even when only the remote side
  // needed catching up — so the caller (the Drive sync panel) can push it
  // straight back without a second pull/merge round-trip.
  const reconcileWithRemote = useCallback(
    (remote: unknown, remoteTombstones?: unknown) => {
      backupProjects(projects)
      const combinedTombstones = pruneTombstones(
        mergeTombstones(tombstones, normalizeTombstones(remoteTombstones)),
        new Date().toISOString(),
        TOMBSTONE_TTL_MS,
      )
      const { merged, localChanged } = model.mergeProjectsByFreshness(
        projects,
        normalizeProjectsState(remote),
        combinedTombstones,
      )
      if (localChanged) persist(merged)
      if (combinedTombstones !== tombstones) setTombstones(combinedTombstones)
      return { projects: merged, tombstones: combinedTombstones }
    },
    [projects, persist, tombstones],
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
    createFiles,
    renameFile,
    deleteFile,
    updateFileContent,
    moveFile,
    moveProject,
    archivedProjects,
    toggleProjectArchived,
    archivedFiles,
    toggleFileArchived,
    importProjects,
    reconcileWithRemote,
  }
}
