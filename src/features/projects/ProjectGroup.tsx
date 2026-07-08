import type { JSX } from 'preact'
import { memo } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { FileRow } from './FileRow'
import { showConfirmDialog, showPromptDialog } from './dialogs'
import type { ProjectFiles } from './types'
import { IconButton } from '@/components'

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
  onExportProject?: (projectName: string) => void
  onUploadFile?: (projectName: string, file: File) => void
}

// One collapsible project entry in the sidebar tree: header (name, expand
// toggle, "..." actions menu) plus its list of files. Wrapped in memo() so
// editing the active file's content doesn't reconcile every OTHER
// project's subtree on every keystroke.
export const ProjectGroup = memo(function ProjectGroup({
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
  onExportProject,
  onUploadFile,
}: ProjectGroupProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  // Memoized so FileRow's memo() isn't defeated by a fresh array every
  // render (Object.keys always returns a new array reference).
  const fileNames = useMemo(() => Object.keys(files), [files])

  const menuId = `project-menu-${projectName}`
  const menuButtonId = `project-menu-button-${projectName}`
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function toggleExpanded() {
    setIsExpanded((expanded) => !expanded)
  }

  function handleHeaderKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleExpanded()
    }
  }

  // Computes the dropdown's position from the trigger button's own
  // bounding box (issue: the menu previously had no positioning logic at
  // all — it relied solely on `position: fixed` with no top/left, so it
  // rendered wherever an offset-less fixed box defaults to, and its items
  // used the generic Button component instead of `.dropdown-item`,
  // producing a ~3x-oversized horizontal strip instead of an anchored
  // vertical menu). Matches the prototype's showProjectMenu() math
  // exactly: anchored just below-left of the trigger, clamped to the
  // viewport's left edge.
  function toggleMenu(e: MouseEvent) {
    e.stopPropagation()
    setIsMenuOpen((open) => {
      if (open) return false
      const buttonEl = document.getElementById(menuButtonId)
      const rect = buttonEl?.getBoundingClientRect()
      if (rect) {
        setMenuPosition({ top: rect.bottom + 4, left: Math.max(4, rect.left - 180) })
      }
      return true
    })
  }

  // Keyboard-navigable dropdown menu (issue: the menu rendered role="menu"
  // but had no focus management at all — no focus-on-open, no arrow-key
  // cycling, no Escape/Tab close, no focus-return to the trigger). Mirrors
  // the prototype's handleMenuKeydown.
  useEffect(() => {
    if (!isMenuOpen) return

    const menuEl = menuRef.current
    if (!menuEl) return

    const items = Array.from(menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    items[0]?.focus()

    function closeAndReturnFocus() {
      setIsMenuOpen(false)
      document.getElementById(menuButtonId)?.focus()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAndReturnFocus()
        return
      }
      if (e.key === 'Tab') {
        closeAndReturnFocus()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()

      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const next = (current + delta + items.length) % items.length
      items[next]?.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMenuOpen, menuButtonId])

  async function handleNewFile(e: MouseEvent) {
    e.stopPropagation()
    setIsMenuOpen(false)
    const name = await showPromptDialog({
      title: 'Novo arquivo',
      label: 'Nome do arquivo',
      placeholder: 'Ex.: notas',
      confirmLabel: 'Criar',
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
      confirmLabel: 'Renomear',
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
      confirmLabel: 'Excluir',
    })
    if (confirmed) onDeleteProject(projectName)
  }

  function handleExportProject(e: MouseEvent) {
    e.stopPropagation()
    setIsMenuOpen(false)
    onExportProject?.(projectName)
  }

  function handleUploadClick(e: MouseEvent) {
    e.stopPropagation()
    setIsMenuOpen(false)
    fileInputRef.current?.click()
  }

  function handleFileSelected(event: JSX.TargetedEvent<HTMLInputElement>) {
    const file = (event.target as HTMLInputElement).files?.[0]
    ;(event.target as HTMLInputElement).value = ''
    if (file) onUploadFile?.(projectName, file)
  }

  // Double-click-to-rename shortcut on the project header, matching the
  // prototype (the ⋮ menu's "Renomear projeto" remains available too).
  function handleHeaderDoubleClick(e: MouseEvent) {
    e.stopPropagation()
    void handleRenameProject(e)
  }

  return (
    <div className="project-group">
      <div
        className={`project-header${isActiveProject ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
        onDblClick={handleHeaderDoubleClick}
        onKeyDown={handleHeaderKeyDown}
      >
        <span className={`project-toggle${isExpanded ? ' expanded' : ''}`} aria-hidden="true">
          ▶
        </span>
        <span className="project-name">{projectName}</span>
        <IconButton
          id={menuButtonId}
          variant="compact"
          icon="⋮"
          label={`Mais opções do projeto ${projectName}`}
          ariaHasPopup="menu"
          ariaExpanded={isMenuOpen}
          ariaControls={menuId}
          onClick={toggleMenu}
        />
      </div>

      {isMenuOpen && (
        <div
          ref={menuRef}
          id={menuId}
          className="dropdown-menu visible"
          role="menu"
          aria-label={`Ações do projeto ${projectName}`}
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
        >
          <button type="button" className="dropdown-item" role="menuitem" onClick={handleNewFile}>
            ➕ Novo arquivo
          </button>
          {onUploadFile && (
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={handleUploadClick}
            >
              📤 Upload
            </button>
          )}
          <button
            type="button"
            className="dropdown-item"
            role="menuitem"
            onClick={handleRenameProject}
          >
            ✏️ Renomear projeto
          </button>
          {onExportProject && (
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={handleExportProject}
            >
              ⬇️ Baixar projeto
            </button>
          )}
          <button
            type="button"
            className="dropdown-item danger"
            role="menuitem"
            onClick={handleDeleteProject}
          >
            🗑 Excluir projeto
          </button>
        </div>
      )}

      {onUploadFile && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown"
          hidden
          onChange={handleFileSelected}
        />
      )}

      <div className={`project-files${isExpanded ? ' expanded' : ''}`}>
        {fileNames.length === 0 ? (
          <div className="project-files-empty">Nenhum arquivo</div>
        ) : (
          fileNames.map((fileName) => (
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
          ))
        )}
      </div>
    </div>
  )
})
