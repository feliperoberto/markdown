import type { JSX } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ProjectGroup } from './ProjectGroup'
import { showPromptDialog } from './dialogs'
import { decodeArchivedFileKey, fileExists, isFileArchived, projectExists } from './model'
import { loadCollapsedProjects, saveCollapsedProjects } from './storage'
import type { ProjectsState } from './types'

// Stable empty-set default for the `archivedProjects` prop: a `= new Set()`
// default parameter would allocate a fresh Set every render and defeat
// ProjectGroup's memo().
const NO_ARCHIVED: ReadonlySet<string> = new Set()
// Same reasoning, one level down, for the archived-files sidecar.
const NO_ARCHIVED_FILES: ReadonlySet<string> = new Set()
// Fallback for a project with no archived files of its own, used by the
// per-project derivation below — same stable-empty-set reasoning.
const NO_ARCHIVED_FILE_NAMES: ReadonlySet<string> = new Set()

export interface ProjectsSidebarProps {
  projects: ProjectsState
  currentProject: string | null
  currentFile: string | null
  onSelectFile: (projectName: string, fileName: string) => void
  onCreateProject: (name: string) => void
  onCreateFile: (projectName: string, fileName: string) => void
  onRenameFile: (projectName: string, oldFileName: string, newFileName: string) => void
  onDeleteFile: (projectName: string, fileName: string) => void
  onRenameProject: (oldName: string, newName: string) => void
  onDeleteProject: (projectName: string) => void
  // Batch-download hook-up point: called whenever the multi-select
  // checkbox set changes, so a consumer (e.g. the batch download area)
  // can react without this component owning that UI.
  onSelectionChange?: (selection: ReadonlyArray<{ projectName: string; fileName: string }>) => void
  // Mobile drawer state (issue: sidebar has no way to dismiss on narrow
  // viewports without this). Undefined/false on desktop, where the
  // sidebar is always visible inline regardless of this prop.
  mobileHidden?: boolean
  // Per-project "Baixar projeto"/"Upload" menu actions — implemented in
  // app.tsx (see its doc comment) since this feature may not import
  // import-export directly. Optional so the menu items only render when
  // a caller opts in.
  onExportProject?: (projectName: string) => void
  onUploadFile?: (projectName: string, file: File) => void
  onUploadMultipleFiles?: (projectName: string, files: File[]) => void
  /** Sidebar-footer "📥 Importar" (ZIP) — same taxonomy reason as above. */
  onImportZip?: (file: File) => void
  /** Sidebar-footer "⚙️ Config" — opens the Drive/Config modal (app.tsx owns it). */
  onOpenConfig?: () => void
  // Drag & drop (issue #92): reorder files within a project / move them
  // across projects, and reorder the projects themselves. Optional so the
  // tree still renders (without DnD) when a caller doesn't wire them.
  onMoveFile?: (
    fromProject: string,
    fileName: string,
    toProject: string,
    beforeFile?: string | null,
  ) => void
  onMoveProject?: (projectName: string, beforeProject?: string | null) => void
  // Archive feature: names of projects hidden from the everyday list, and
  // the callback that flips one project's archived state. Optional so the
  // tree still renders (with nothing archived) when a caller doesn't wire
  // it up, matching this file's convention for feature-gating props.
  archivedProjects?: ReadonlySet<string>
  onToggleArchived?: (projectName: string) => void
  // Archive feature (files): composite keys of files hidden from their
  // project's everyday list, and the callback that flips one file's
  // archived state. Same feature-gating convention as the props above.
  archivedFiles?: ReadonlySet<string>
  onToggleFileArchived?: (projectName: string, fileName: string) => void
}

// Renders the full project/file sidebar tree. Owns only tree
// rendering + the transient multi-select selection; CRUD state lives in
// `useProjects`, and interaction chrome (dropdown, dialogs) is intentionally
// minimal per issue #19 (skip re-implementing the polished interaction UI).
export function ProjectsSidebar({
  projects,
  currentProject,
  currentFile,
  onSelectFile,
  onCreateProject,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onRenameProject,
  onDeleteProject,
  onSelectionChange,
  mobileHidden = false,
  onExportProject,
  onUploadFile,
  onUploadMultipleFiles,
  onImportZip,
  onOpenConfig,
  onMoveFile,
  onMoveProject,
  archivedProjects = NO_ARCHIVED,
  onToggleArchived,
  archivedFiles = NO_ARCHIVED_FILES,
  onToggleFileArchived,
}: ProjectsSidebarProps): JSX.Element {
  const [selectedByProject, setSelectedByProject] = useState<Record<string, Set<string>>>({})
  // Which "..." actions menu is open, if any — a single slot shared across
  // every ProjectGroup AND every FileRow (bug: previously each ProjectGroup
  // tracked isMenuOpen as its own local state, so opening a second
  // project's menu didn't close the first, leaving multiple menus open at
  // once; file rows didn't have a menu at all, see the swipe/hover-reveal
  // fix below). A single discriminated slot — rather than two independent
  // ones — keeps a project's menu and a file's menu mutually exclusive too:
  // without that, opening a file's menu while a project's menu from a
  // DIFFERENT project was open would leave both floating at once. Stable
  // callbacks so setting this doesn't defeat ProjectGroup's/FileRow's
  // memo() for rows whose own isMenuOpen value doesn't change.
  const [openMenu, setOpenMenu] = useState<
    { kind: 'project'; project: string } | { kind: 'file'; project: string; file: string } | null
  >(null)
  const handleOpenProjectMenu = useCallback((projectName: string) => {
    setOpenMenu({ kind: 'project', project: projectName })
  }, [])
  const handleOpenFileMenu = useCallback((projectName: string, fileName: string) => {
    setOpenMenu({ kind: 'file', project: projectName, file: fileName })
  }, [])
  const handleCloseMenu = useCallback(() => {
    setOpenMenu(null)
  }, [])
  // The full, unfiltered list. This is what duplicate-name validation
  // (handleNewProject below, and ProjectGroup's rename validation) must see
  // — filtering it would let a user create/rename into a name collision
  // with a hidden archived project, which model.createProject/renameProject
  // would then silently no-op. Memoized because Object.keys returns a new
  // array reference every render, which would defeat ProjectGroup's memo().
  const projectNames = useMemo(() => Object.keys(projects), [projects])
  const archivedCount = projectNames.filter((name) => archivedProjects.has(name)).length
  // Whether the archived section is expanded — deliberately transient, not
  // persisted like collapsedProjects: archiving means "out of my way", so a
  // reload should show only the everyday list again.
  const [showArchived, setShowArchived] = useState(false)
  const visibleProjectNames = useMemo(
    () =>
      showArchived ? projectNames : projectNames.filter((name) => !archivedProjects.has(name)),
    [projectNames, archivedProjects, showArchived],
  )
  // Per-project derivation of `archivedFiles` (a global Set of composite
  // keys, new-referenced on every single file's archive toggle anywhere in
  // the app) into a plain Set of file names scoped to just that project.
  // Passing the raw global Set straight through to every `ProjectGroup`
  // instance previously defeated its memo() for every OTHER project too —
  // archiving one file in project A gave a new `archivedFiles` reference
  // that every project's `ProjectGroup` prop-compared as "changed", so all
  // of them re-rendered, not just A's. A ref-based cache reuses the same
  // per-project Set reference across renders whenever that project's own
  // archived files didn't actually change (by content, not just by the
  // global Set's identity), restoring memo()'s per-project isolation —
  // mirroring how `isArchived` narrows `archivedProjects` to a boolean per
  // project for the same reason.
  const archivedFileNamesByProjectRef = useRef<Map<string, ReadonlySet<string>>>(new Map())
  const archivedFileNamesByProject = useMemo(() => {
    const cache = archivedFileNamesByProjectRef.current
    const byProject = new Map<string, Set<string>>()
    for (const key of archivedFiles) {
      const decoded = decodeArchivedFileKey(key)
      if (!decoded) continue
      let names = byProject.get(decoded.project)
      if (!names) {
        names = new Set()
        byProject.set(decoded.project, names)
      }
      names.add(decoded.file)
    }
    const next = new Map<string, ReadonlySet<string>>()
    for (const projectName of projectNames) {
      const names = byProject.get(projectName) ?? NO_ARCHIVED_FILE_NAMES
      const cached = cache.get(projectName)
      const unchanged =
        cached && cached.size === names.size && [...names].every((name) => cached.has(name))
      next.set(projectName, unchanged ? cached : names)
    }
    archivedFileNamesByProjectRef.current = next
    return next
  }, [projectNames, archivedFiles])

  const importZipInputRef = useRef<HTMLInputElement>(null)

  // Remembered collapsed/expanded state per project (issue #92). Seeded
  // from localStorage so a returning user sees the same projects folded as
  // when they left; persisted on every change.
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() =>
    loadCollapsedProjects(),
  )

  useEffect(() => {
    saveCollapsedProjects(collapsedProjects)
  }, [collapsedProjects])

  // Closes a dangling open menu if its project (or, for a file menu, the
  // file itself) was deleted/renamed out from under it — e.g. via the
  // "Excluir projeto"/"Excluir arquivo" action inside that same menu.
  useEffect(() => {
    setOpenMenu((prev) => {
      if (prev === null || !projectExists(projects, prev.project)) return null
      if (prev.kind === 'file' && !fileExists(projects, prev.project, prev.file)) return null
      return prev
    })
  }, [projects])

  // Drop entries for projects that no longer exist (deleted/renamed) so the
  // persisted set doesn't accumulate stale names forever.
  useEffect(() => {
    setCollapsedProjects((prev) => {
      // Own-property check (not `name in projects`) so a project named like
      // an Object.prototype member — 'constructor', 'toString', … — is
      // pruned correctly after deletion, matching model.projectExists.
      const next = new Set(
        [...prev].filter((name) => Object.prototype.hasOwnProperty.call(projects, name)),
      )
      return next.size === prev.size ? prev : next
    })
  }, [projects])

  // Stable across renders (functional setState) so it doesn't defeat
  // ProjectGroup's memo() — only the toggled project re-renders.
  const toggleProjectCollapsed = useCallback((projectName: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectName)) next.delete(projectName)
      else next.add(projectName)
      return next
    })
  }, [])

  // Prunes stale selection entries whenever the project/file set changes
  // (rename, delete, import, restore) — and also when a project, or an
  // individual file, is archived: its checkbox goes off-screen behind the
  // "Mostrar arquivados" toggler (the project's or the per-project one), so
  // a file checked before archiving must not silently stay in the
  // batch-download selection. Previously a renamed/deleted file stayed in
  // `selectedByProject` forever: the checkbox visually stayed "checked" for
  // a file that no longer exists under that name, and — had
  // `batchSelectionEntries` (app.tsx) not separately filtered dead
  // entries — a batch export could silently drop a file the user believed
  // was still selected.
  useEffect(() => {
    setSelectedByProject((prev) => {
      let changed = false
      const next: Record<string, Set<string>> = {}
      for (const [projectName, fileNames] of Object.entries(prev)) {
        const files = projects[projectName]
        if (!files || archivedProjects.has(projectName)) {
          changed = true
          continue
        }
        const survivors = new Set(
          [...fileNames].filter(
            (name) => name in files && !isFileArchived(archivedFiles, projectName, name),
          ),
        )
        if (survivors.size !== fileNames.size) changed = true
        if (survivors.size > 0) next[projectName] = survivors
      }
      if (!changed) return prev

      onSelectionChange?.(
        Object.entries(next).flatMap(([proj, files]) =>
          Array.from(files).map((file) => ({ projectName: proj, fileName: file })),
        ),
      )
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSelectionChange intentionally excluded: it's a per-render callback prop, not state this effect should re-run for.
  }, [projects, archivedProjects, archivedFiles])

  function toggleSelected(projectName: string, fileName: string, selected: boolean) {
    setSelectedByProject((prev) => {
      const next = { ...prev }
      const current = new Set(next[projectName] ?? [])
      if (selected) current.add(fileName)
      else current.delete(fileName)
      next[projectName] = current

      onSelectionChange?.(
        Object.entries(next).flatMap(([proj, files]) =>
          Array.from(files).map((file) => ({ projectName: proj, fileName: file })),
        ),
      )
      return next
    })
  }

  async function handleNewProject(e: MouseEvent) {
    e.stopPropagation()
    const name = await showPromptDialog({
      title: 'Novo projeto',
      label: 'Nome do novo projeto',
      placeholder: 'Ex.: Meu Projeto',
      confirmLabel: 'Criar',
      validate: (value) => {
        if (!value) return 'Digite um nome para o projeto.'
        if (projectNames.includes(value)) return 'Já existe um projeto com esse nome.'
        return null
      },
    })
    if (name) onCreateProject(name)
  }

  function handleImportZipClick(e: MouseEvent) {
    e.stopPropagation()
    importZipInputRef.current?.click()
  }

  function handleImportZipFileSelected(event: JSX.TargetedEvent<HTMLInputElement>) {
    const file = (event.target as HTMLInputElement).files?.[0]
    ;(event.target as HTMLInputElement).value = ''
    if (file) onImportZip?.(file)
  }

  return (
    <nav
      className={`projects-sidebar${mobileHidden ? ' sidebar-hidden' : ''}`}
      id="projectsSidebar"
      aria-label="Projetos e arquivos"
    >
      <div className="sidebar-header">
        <span className="sidebar-title" id="sidebarTitle">
          Projetos
        </span>
      </div>
      <div className="sidebar-content">
        <div
          className="projects-list"
          id="projectsList"
          role="region"
          aria-labelledby="sidebarTitle"
        >
          {projectNames.length === 0 ? (
            <div className="projects-list-empty">Nenhum projeto ainda. Marque o primeiro.</div>
          ) : visibleProjectNames.length === 0 ? (
            <div className="projects-list-empty">
              Todos os projetos estão arquivados. Use o botão abaixo para mostrá-los.
            </div>
          ) : (
            visibleProjectNames.map((projectName) => (
              <ProjectGroup
                key={projectName}
                projectName={projectName}
                files={projects[projectName]!}
                isActiveProject={currentProject === projectName}
                isExpanded={!collapsedProjects.has(projectName)}
                isArchived={archivedProjects.has(projectName)}
                currentFile={currentProject === projectName ? currentFile : null}
                selectedFiles={selectedByProject[projectName] ?? new Set()}
                projectNames={projectNames}
                onSelectFile={onSelectFile}
                onToggleExpanded={toggleProjectCollapsed}
                isMenuOpen={openMenu?.kind === 'project' && openMenu.project === projectName}
                onOpenMenu={handleOpenProjectMenu}
                onCloseMenu={handleCloseMenu}
                openFileMenu={
                  openMenu?.kind === 'file' && openMenu.project === projectName
                    ? openMenu.file
                    : null
                }
                onOpenFileMenu={handleOpenFileMenu}
                onToggleSelected={toggleSelected}
                onCreateFile={onCreateFile}
                onRenameFile={onRenameFile}
                onDeleteFile={onDeleteFile}
                onRenameProject={onRenameProject}
                onDeleteProject={onDeleteProject}
                onExportProject={onExportProject}
                onUploadFile={onUploadFile}
                onUploadMultipleFiles={onUploadMultipleFiles}
                onMoveFile={onMoveFile}
                onMoveProject={onMoveProject}
                onToggleArchived={onToggleArchived}
                archivedFileNames={
                  archivedFileNamesByProject.get(projectName) ?? NO_ARCHIVED_FILE_NAMES
                }
                onToggleFileArchived={onToggleFileArchived}
              />
            ))
          )}

          {archivedCount > 0 && (
            <button
              type="button"
              className={`archived-toggle${showArchived ? ' active' : ''}`}
              aria-pressed={showArchived}
              onClick={() => setShowArchived((v) => !v)}
            >
              <span aria-hidden="true">📦</span>
              <span>
                {showArchived ? 'Ocultar arquivados' : `Mostrar arquivados (${archivedCount})`}
              </span>
            </button>
          )}
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-footer-btn"
            title="Novo projeto"
            aria-label="Criar novo projeto"
            onClick={handleNewProject}
          >
            <span className="sidebar-footer-icon" aria-hidden="true">
              ➕
            </span>
            <span className="sidebar-footer-label">Novo</span>
          </button>
          <button
            type="button"
            className="sidebar-footer-btn"
            title="Importar ZIP"
            aria-label="Importar projetos de um arquivo ZIP"
            onClick={handleImportZipClick}
          >
            <span className="sidebar-footer-icon" aria-hidden="true">
              📥
            </span>
            <span className="sidebar-footer-label">Importar</span>
          </button>
          <button
            type="button"
            className="sidebar-footer-btn"
            title="Configurações"
            aria-label="Abrir configurações"
            aria-haspopup="dialog"
            onClick={onOpenConfig}
          >
            <span className="sidebar-footer-icon" aria-hidden="true">
              ⚙️
            </span>
            <span className="sidebar-footer-label">Config</span>
          </button>
        </div>
      </div>

      <input
        ref={importZipInputRef}
        type="file"
        accept=".zip"
        hidden
        onChange={handleImportZipFileSelected}
      />
    </nav>
  )
}
