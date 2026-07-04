import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { FileRow } from './FileRow'
import { showConfirmDialog, showPromptDialog } from './dialogs'
import type { ProjectFiles } from './types'

export interface ProjectGroupProps {
  projectName: string
  files: ProjectFiles
  isActiveProject: boolean
  currentFile: string | null
  selectedFiles: ReadonlySet<string>
  projectNames: string[]
  onSelectFile: (projectName: string, fileName: string) => void
  onToggleSelected: (projectName: string, fileName: string, selected: boolean) => void
  onCreateFile: (projectName: string, fileName: string) => void
  onRenameFile: (projectName: string, oldFileName: string, newFileName: string) => void
  onDeleteFile: (projectName: string, fileName: string) => void
  onRenameProject: (oldName: string, newName: string) => void
  onDeleteProject: (projectName: string) => void
}

// One collapsible project entry in the sidebar tree: header (name, expand
// toggle, "..." actions menu) plus its list of files.
export function ProjectGroup({
  projectName,
  files,
  isActiveProject,
  currentFile,
  selectedFiles,
  projectNames,
  onSelectFile,
  onToggleSelected,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onRenameProject,
  onDeleteProject,
}: ProjectGroupProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const fileNames = Object.keys(files)

  function toggleExpanded() {
    setIsExpanded((expanded) => !expanded)
  }

  function toggleMenu(e: MouseEvent) {
    e.stopPropagation()
    setIsMenuOpen((open) => !open)
  }

  async function handleNewFile(e: MouseEvent) {
    e.stopPropagation()
    setIsMenuOpen(false)
    const name = await showPromptDialog({
      title: 'Novo arquivo',
      label: 'Nome do arquivo',
      validate: (value) => {
        if (!value) return 'Digite um nome para o arquivo.'
        if (fileNames.includes(value)) return 'Já existe um arquivo com esse nome.'
        return null
      },
    })
    if (name) onCreateFile(projectName, name)
  }

  async function handleRenameProject(e: MouseEvent) {
    e.stopPropagation()
    setIsMenuOpen(false)
    const trimmed = await showPromptDialog({
      title: 'Renomear projeto',
      label: 'Novo nome do projeto',
      defaultValue: projectName,
      validate: (value) => {
        if (!value) return 'Digite um nome para o projeto.'
        if (value !== projectName && projectNames.includes(value)) return 'Já existe um projeto com esse nome.'
        return null
      },
    })
    if (trimmed && trimmed !== projectName) onRenameProject(projectName, trimmed)
  }

  async function handleDeleteProject(e: MouseEvent) {
    e.stopPropagation()
    setIsMenuOpen(false)
    const confirmed = await showConfirmDialog({
      title: 'Excluir projeto',
      message: `Excluir o projeto "${projectName}" e todos os seus arquivos? Essa ação não pode ser desfeita.`,
    })
    if (confirmed) onDeleteProject(projectName)
  }

  return (
    <div className="project-group">
      <div className={`project-header${isActiveProject ? ' active' : ''}`} onClick={toggleExpanded}>
        <span className={`project-toggle${isExpanded ? ' expanded' : ''}`} aria-hidden="true">
          ▶
        </span>
        <span className="project-name">{projectName}</span>
        <button
          type="button"
          className="project-menu"
          aria-label={`Mais opções do projeto ${projectName}`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={toggleMenu}
        >
          ⋮
        </button>
      </div>

      {isMenuOpen && (
        <div className="dropdown-menu visible" role="menu" aria-label={`Ações do projeto ${projectName}`}>
          <button type="button" className="dropdown-item" role="menuitem" onClick={handleNewFile}>
            Novo arquivo
          </button>
          <button type="button" className="dropdown-item" role="menuitem" onClick={handleRenameProject}>
            Renomear projeto
          </button>
          <button
            type="button"
            className="dropdown-item"
            role="menuitem"
            style={{ color: 'var(--danger)' }}
            onClick={handleDeleteProject}
          >
            Excluir projeto
          </button>
        </div>
      )}

      <div className={`project-files${isExpanded ? ' expanded' : ''}`}>
        {fileNames.map((fileName) => (
          <FileRow
            key={fileName}
            projectName={projectName}
            file={files[fileName]!}
            isActive={isActiveProject && currentFile === fileName}
            isSelected={selectedFiles.has(fileName)}
            fileNames={fileNames}
            onSelectFile={onSelectFile}
            onToggleSelected={onToggleSelected}
            onRenameFile={onRenameFile}
            onDeleteFile={onDeleteFile}
          />
        ))}
      </div>
    </div>
  )
}
