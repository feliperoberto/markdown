import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { FileRow } from './FileRow'
import { showConfirmDialog, showPromptDialog } from './dialogs'
import type { ProjectFiles } from './types'
import { Button, IconButton } from '@/components'

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

  function handleHeaderKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleExpanded()
    }
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
        if (value !== projectName && projectNames.includes(value))
          return 'Já existe um projeto com esse nome.'
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
      <div
        className={`project-header${isActiveProject ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
        onKeyDown={handleHeaderKeyDown}
      >
        <span className={`project-toggle${isExpanded ? ' expanded' : ''}`} aria-hidden="true">
          ▶
        </span>
        <span className="project-name">{projectName}</span>
        <IconButton
          variant="compact"
          icon="⋮"
          label={`Mais opções do projeto ${projectName}`}
          ariaHasPopup="menu"
          ariaExpanded={isMenuOpen}
          onClick={toggleMenu}
        />
      </div>

      {isMenuOpen && (
        <div
          className="dropdown-menu visible"
          role="menu"
          aria-label={`Ações do projeto ${projectName}`}
        >
          <span role="menuitem">
            <Button variant="default" onClick={handleNewFile}>
              Novo arquivo
            </Button>
          </span>
          <span role="menuitem">
            <Button variant="default" onClick={handleRenameProject}>
              Renomear projeto
            </Button>
          </span>
          <span role="menuitem">
            <Button variant="danger" onClick={handleDeleteProject}>
              Excluir projeto
            </Button>
          </span>
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
