import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { ProjectGroup } from './ProjectGroup'
import { showPromptDialog } from './dialogs'
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
}: ProjectsSidebarProps): JSX.Element {
  const [selectedByProject, setSelectedByProject] = useState<Record<string, Set<string>>>({})
  const projectNames = Object.keys(projects)

  function toggleSelected(projectName: string, fileName: string, selected: boolean) {
    setSelectedByProject((prev) => {
      const next = { ...prev }
      const current = new Set(next[projectName] ?? [])
      if (selected) current.add(fileName)
      else current.delete(fileName)
      next[projectName] = current

      onSelectionChange?.(
        Object.entries(next).flatMap(([proj, files]) => Array.from(files).map((file) => ({ projectName: proj, fileName: file })))
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
      validate: (value) => {
        if (!value) return 'Digite um nome para o projeto.'
        if (projectNames.includes(value)) return 'Já existe um projeto com esse nome.'
        return null
      },
    })
    if (name) onCreateProject(name)
  }

  return (
    <nav className="projects-sidebar" aria-label="Projetos e arquivos">
      <button type="button" id="newProjectBtn" onClick={handleNewProject}>
        Novo projeto
      </button>

      <div className="projects-list" id="projectsList">
        {projectNames.length === 0 ? (
          <div className="projects-list-empty">Nenhum projeto ainda. Marque o primeiro.</div>
        ) : (
          projectNames.map((projectName) => (
            <ProjectGroup
              key={projectName}
              projectName={projectName}
              files={projects[projectName]!}
              isActiveProject={currentProject === projectName}
              currentFile={currentProject === projectName ? currentFile : null}
              selectedFiles={selectedByProject[projectName] ?? new Set()}
              projectNames={projectNames}
              onSelectFile={onSelectFile}
              onToggleSelected={toggleSelected}
              onCreateFile={onCreateFile}
              onRenameFile={onRenameFile}
              onDeleteFile={onDeleteFile}
              onRenameProject={onRenameProject}
              onDeleteProject={onDeleteProject}
            />
          ))
        )}
      </div>
    </nav>
  )
}
