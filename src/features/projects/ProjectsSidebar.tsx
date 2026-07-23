import type { JSX } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { ProjectGroup } from './ProjectGroup'
import { showPromptDialog } from './dialogs'
import { loadCollapsedProjects, saveCollapsedProjects } from './storage'
import type { ProjectsState } from './types'

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
}: ProjectsSidebarProps): JSX.Element {
  const [selectedByProject, setSelectedByProject] = useState<Record<string, Set<string>>>({})
  const projectNames = Object.keys(projects)
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
  // (rename, delete, import, restore). Previously a renamed/deleted file
  // stayed in `selectedByProject` forever: the checkbox visually stayed
  // "checked" for a file that no longer exists under that name, and — had
  // `batchSelectionEntries` (app.tsx) not separately filtered dead
  // entries — a batch export could silently drop a file the user believed
  // was still selected.
  useEffect(() => {
    setSelectedByProject((prev) => {
      let changed = false
      const next: Record<string, Set<string>> = {}
      for (const [projectName, fileNames] of Object.entries(prev)) {
        const files = projects[projectName]
        if (!files) {
          changed = true
          continue
        }
        const survivors = new Set([...fileNames].filter((name) => name in files))
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
  }, [projects])

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
          ) : (
            projectNames.map((projectName) => (
              <ProjectGroup
                key={projectName}
                projectName={projectName}
                files={projects[projectName]!}
                isActiveProject={currentProject === projectName}
                isExpanded={!collapsedProjects.has(projectName)}
                currentFile={currentProject === projectName ? currentFile : null}
                selectedFiles={selectedByProject[projectName] ?? new Set()}
                projectNames={projectNames}
                onSelectFile={onSelectFile}
                onToggleExpanded={toggleProjectCollapsed}
                onToggleSelected={toggleSelected}
                onCreateFile={onCreateFile}
                onRenameFile={onRenameFile}
                onDeleteFile={onDeleteFile}
                onRenameProject={onRenameProject}
                onDeleteProject={onDeleteProject}
                onExportProject={onExportProject}
                onUploadFile={onUploadFile}
                onUploadMultipleFiles={onUploadMultipleFiles}
              />
            ))
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
