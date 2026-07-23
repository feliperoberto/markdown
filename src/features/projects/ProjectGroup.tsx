import type { JSX } from 'preact'
import { memo } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { FileRow } from './FileRow'
import { showConfirmDialog, showPromptDialog } from './dialogs'
import { DND_MIME, getActiveDragKind, readDrag, serializeDrag, setActiveDrag } from './dnd'
import type { ProjectFiles } from './types'
import { IconButton } from '@/components'

export interface ProjectGroupProps {
  projectName: string
  files: ProjectFiles
  isActiveProject: boolean
  /** Expanded/collapsed state, owned by the sidebar so it can be persisted (issue #92). */
  isExpanded: boolean
  currentFile: string | null
  selectedFiles: ReadonlySet<string>
  projectNames: string[]
  onSelectFile: (projectName: string, fileName: string) => void
  /** Toggles this project's expanded state; takes the name so the callback stays memo-stable. */
  onToggleExpanded: (projectName: string) => void
  onToggleSelected: (projectName: string, fileName: string, selected: boolean) => void
  onCreateFile: (projectName: string, fileName: string) => void
  onRenameFile: (projectName: string, oldFileName: string, newFileName: string) => void
  onDeleteFile: (projectName: string, fileName: string) => void
  onRenameProject: (oldName: string, newName: string) => void
  onDeleteProject: (projectName: string) => void
  onExportProject?: (projectName: string) => void
  onUploadFile?: (projectName: string, file: File) => void
  /**
   * Import several .md files into this project at once. Not in the
   * prototype (its per-project menu only has single-file Upload) — kept
   * as a menu item here rather than hidden entirely, per explicit
   * discussion, since removing multi-file import would be a real
   * capability regression, not a fix.
   */
  onUploadMultipleFiles?: (projectName: string, files: File[]) => void
  // Drag & drop (issue #92): reorder/move files and reorder projects.
  onMoveFile?: (
    fromProject: string,
    fileName: string,
    toProject: string,
    beforeFile?: string | null,
  ) => void
  onMoveProject?: (projectName: string, beforeProject?: string | null) => void
}

// One collapsible project entry in the sidebar tree: header (name, expand
// toggle, "..." actions menu) plus its list of files. Wrapped in memo() so
// editing the active file's content doesn't reconcile every OTHER
// project's subtree on every keystroke.
export const ProjectGroup = memo(function ProjectGroup({
  projectName,
  files,
  isActiveProject,
  isExpanded,
  currentFile,
  selectedFiles,
  projectNames,
  onSelectFile,
  onToggleExpanded,
  onToggleSelected,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onRenameProject,
  onDeleteProject,
  onExportProject,
  onUploadFile,
  onUploadMultipleFiles,
  onMoveFile,
  onMoveProject,
}: ProjectGroupProps): JSX.Element {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  // True while a compatible drag hovers this project — drives the drop
  // highlight without touching global state.
  const [isDropTarget, setIsDropTarget] = useState(false)
  // Memoized so FileRow's memo() isn't defeated by a fresh array every
  // render (Object.keys always returns a new array reference).
  const fileNames = useMemo(() => Object.keys(files), [files])

  const menuId = `project-menu-${projectName}`
  const menuButtonId = `project-menu-button-${projectName}`
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const multiFileInputRef = useRef<HTMLInputElement>(null)

  const dragEnabled = Boolean(onMoveFile || onMoveProject)

  function toggleExpanded() {
    onToggleExpanded(projectName)
  }

  function handleHeaderKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleExpanded()
    }
  }

  // --- Drag & drop (issue #92) ---
  // The project header is the drag handle for reordering projects; the
  // whole group is a drop zone that accepts either a project (reorder,
  // dropping before this one) or a file (move into this project, appended).
  function handleHeaderDragStart(e: DragEvent) {
    if (!onMoveProject) return
    const payload = { kind: 'project' as const, project: projectName }
    e.dataTransfer?.setData(DND_MIME, serializeDrag(payload))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    setActiveDrag(payload)
  }

  function handleHeaderDragEnd() {
    setActiveDrag(null)
  }

  function handleGroupDragOver(e: DragEvent) {
    // Opt in only for one of our own drags (a file to move in, or a project
    // to reorder). getData is unreadable here, so the drop handler still
    // re-validates by kind — but consulting the active-drag flag first keeps
    // foreign OS-file/text drags from highlighting the group or triggering a
    // navigating drop.
    if (!dragEnabled || getActiveDragKind() === null) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    if (!isDropTarget) setIsDropTarget(true)
  }

  function handleGroupDragLeave(e: DragEvent) {
    // Ignore leaves fired while moving between this group's own children.
    if (e.currentTarget instanceof Node && e.relatedTarget instanceof Node) {
      if ((e.currentTarget as Node).contains(e.relatedTarget as Node)) return
    }
    setIsDropTarget(false)
  }

  function handleGroupDrop(e: DragEvent) {
    if (!dragEnabled) return
    setIsDropTarget(false)
    const payload = readDrag(e)
    if (!payload) return
    e.preventDefault()
    if (payload.kind === 'project') {
      onMoveProject?.(payload.project, projectName)
    } else {
      // Append into this project (no specific before-file when dropping on
      // the group itself rather than a row).
      onMoveFile?.(payload.project, payload.file, projectName, null)
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

  function handleUploadMultipleClick(e: MouseEvent) {
    e.stopPropagation()
    setIsMenuOpen(false)
    multiFileInputRef.current?.click()
  }

  function handleMultipleFilesSelected(event: JSX.TargetedEvent<HTMLInputElement>) {
    const files = Array.from((event.target as HTMLInputElement).files ?? [])
    ;(event.target as HTMLInputElement).value = ''
    if (files.length > 0) onUploadMultipleFiles?.(projectName, files)
  }

  // Double-click-to-rename shortcut on the project header, matching the
  // prototype (the ⋮ menu's "Renomear projeto" remains available too).
  function handleHeaderDoubleClick(e: MouseEvent) {
    e.stopPropagation()
    void handleRenameProject(e)
  }

  return (
    <div
      className={`project-group${isDropTarget ? ' drop-target' : ''}`}
      onDragOver={handleGroupDragOver}
      onDragLeave={handleGroupDragLeave}
      onDrop={handleGroupDrop}
    >
      <div
        className={`project-header${isActiveProject ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        draggable={Boolean(onMoveProject)}
        onDragStart={handleHeaderDragStart}
        onDragEnd={handleHeaderDragEnd}
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
          {onUploadMultipleFiles && (
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={handleUploadMultipleClick}
            >
              📤 Importar vários arquivos
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

      {onUploadMultipleFiles && (
        <input
          ref={multiFileInputRef}
          type="file"
          accept=".md,text/markdown"
          multiple
          hidden
          onChange={handleMultipleFilesSelected}
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
              onMoveFile={onMoveFile}
            />
          ))
        )}
      </div>
    </div>
  )
})
