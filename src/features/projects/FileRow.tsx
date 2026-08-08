import type { JSX } from 'preact'
import { memo } from 'preact/compat'
import { useState } from 'preact/hooks'
import type { ProjectFile } from './types'
import { showPromptDialog } from './dialogs'
import { DND_MIME, getActiveDragKind, readDrag, serializeDrag, setActiveDrag } from './dnd'
import { Checkbox, IconButton } from '@/components'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import { useDropdownMenu } from '@/lib/useDropdownMenu'

export interface FileRowProps {
  projectName: string
  file: ProjectFile
  isActive: boolean
  isSelected: boolean
  /** Archive feature: hidden from the project's everyday list, shown via ProjectGroup's "Mostrar arquivados" toggler. */
  isArchived: boolean
  fileNames: string[]
  onSelectFile: (projectName: string, fileName: string) => void
  /**
   * Whether THIS file's "..." actions menu is open. Owned by the sidebar
   * (not local state), one level down from ProjectGroup's own `isMenuOpen`
   * — see ProjectsSidebar's single `openMenu` slot, which a project's menu
   * and any file's menu all share so at most one is ever open at once.
   */
  isMenuOpen: boolean
  /** Opens this file's menu, closing whichever other project/file menu was open. */
  onOpenMenu: (projectName: string, fileName: string) => void
  /** Closes the menu, regardless of which project or file currently owns it. */
  onCloseMenu: () => void
  onToggleSelected: (projectName: string, fileName: string, selected: boolean) => void
  onRenameFile: (projectName: string, oldFileName: string, newFileName: string) => void
  onDeleteFile: (projectName: string, fileName: string) => void
  /** Archive feature: flips this file's archived state. */
  onToggleArchived?: (projectName: string, fileName: string) => void
  /**
   * Drag & drop (issue #92). When provided, the row becomes draggable and
   * a drop target: dropping a file here inserts the dragged file directly
   * before this one (moving it across projects if needed).
   */
  onMoveFile?: (
    fromProject: string,
    fileName: string,
    toProject: string,
    beforeFile?: string | null,
  ) => void
}

// Renders one file row in the sidebar tree, including its "..." actions
// menu (rename/archive/delete) and the multi-select checkbox used for
// batch download. Wrapped in memo() so editing the active file's content
// doesn't reconcile every OTHER file row in the sidebar on every
// keystroke — effective only as long as `fileNames` is itself a stable
// reference (see ProjectGroup, which memoizes it), since a fresh array
// every render would defeat this.
export const FileRow = memo(function FileRow({
  projectName,
  file,
  isActive,
  isSelected,
  isArchived,
  fileNames,
  onSelectFile,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
  onToggleSelected,
  onRenameFile,
  onDeleteFile,
  onToggleArchived,
  onMoveFile,
}: FileRowProps): JSX.Element {
  const [isDropTarget, setIsDropTarget] = useState(false)

  const {
    triggerId: menuButtonId,
    menuId,
    menuRef,
    menuPosition,
    toggleMenu,
  } = useDropdownMenu(isMenuOpen, () => onOpenMenu(projectName, file.name), onCloseMenu)

  // --- Drag & drop (issue #92) ---
  function handleDragStart(e: DragEvent) {
    if (!onMoveFile) return
    const payload = { kind: 'file' as const, project: projectName, file: file.name }
    e.dataTransfer?.setData(DND_MIME, serializeDrag(payload))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    setActiveDrag(payload)
  }

  function handleDragEnd() {
    setActiveDrag(null)
  }

  function handleDragOver(e: DragEvent) {
    // Only a file drag can land on a row (insert-before-me). Ignoring every
    // other drag — a project drag, or a foreign OS-file/text drag — means
    // this row never opts in as a drop target for them, so it neither shows
    // a misleading indicator nor swallows/derails the drop.
    if (!onMoveFile || getActiveDragKind() !== 'file') return
    e.preventDefault()
    // Stop the parent project group from also claiming this as a plain
    // "append to project" drop — a row means "insert before me".
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    if (!isDropTarget) setIsDropTarget(true)
  }

  function handleDragLeave() {
    setIsDropTarget(false)
  }

  function handleDrop(e: DragEvent) {
    if (!onMoveFile) return
    setIsDropTarget(false)
    const payload = readDrag(e)
    if (!payload || payload.kind !== 'file') return
    e.preventDefault()
    e.stopPropagation()
    onMoveFile(payload.project, payload.file, projectName, file.name)
  }

  function handleRowClick() {
    onSelectFile(projectName, file.name)
  }

  function handleRowKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleRowClick()
    }
  }

  async function handleRename(e: MouseEvent) {
    e.stopPropagation()
    onCloseMenu()
    const trimmed = await showPromptDialog({
      title: 'Renomear arquivo',
      label: 'Novo nome do arquivo',
      defaultValue: file.name,
      validate: (value) => {
        if (!value) return 'Digite um nome para o arquivo.'
        if (value !== file.name && fileNames.includes(value))
          return 'Já existe um arquivo com esse nome.'
        return null
      },
    })
    if (!trimmed || trimmed === file.name) return
    onRenameFile(projectName, file.name, trimmed)
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation()
    onCloseMenu()
    onDeleteFile(projectName, file.name)
  }

  // Archive feature: reversible from the same menu, so unlike delete this
  // needs no confirm dialog.
  function handleToggleArchived(e: MouseEvent) {
    e.stopPropagation()
    onCloseMenu()
    onToggleArchived?.(projectName, file.name)
  }

  return (
    // Fragment, not a single wrapped div: the menu below is a SIBLING of
    // .file-item, not nested inside it — mirroring ProjectGroup's own
    // header/menu structure, where the dropdown is a sibling of
    // project-header rather than nested inside its onClick. .dropdown-menu
    // is `position: fixed` (out of flow, so it doesn't affect
    // .project-files' flex gap between rows), and keeping it out of
    // .file-item's subtree means a click landing on the menu's own padding
    // never bubbles into the row's onClick and opens the file.
    <>
      <div
        className={`file-item${isActive ? ' active' : ''}${isDropTarget ? ' drop-target' : ''}`}
        role="button"
        tabIndex={0}
        aria-current={isActive ? 'true' : undefined}
        draggable={Boolean(onMoveFile)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
      >
        <span role="presentation" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            label={`Selecionar ${file.name} para download em lote`}
            onChange={(checked) => onToggleSelected(projectName, file.name, checked)}
          />
        </span>
        <span className="file-info">
          <span className="file-name-row">
            <span className="file-name">{file.name}</span>
            {isArchived && (
              // aria-label distinct from ProjectGroup's project-level badge
              // ("Projeto arquivado") — both can be visible at once (a
              // project revealed via the sidebar's "Mostrar arquivados"
              // containing a file revealed via its own per-project
              // toggler), and an identical accessible name on both would
              // make them indistinguishable to assistive tech and to any
              // role-based query, e.g. getByRole('img', { name: 'Arquivado' }).
              <span
                className="file-badge"
                role="img"
                aria-label="Arquivo arquivado"
                title="Arquivo arquivado"
              >
                📦
              </span>
            )}
          </span>
          <span className="file-timestamp" title={new Date(file.timestamp).toLocaleString()}>
            editado {formatRelativeTime(new Date(file.timestamp).getTime())}
          </span>
        </span>
        <IconButton
          id={menuButtonId}
          variant="compact"
          icon="⋮"
          label={`Mais opções do arquivo ${file.name}`}
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
          aria-label={`Ações do arquivo ${file.name}`}
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
        >
          <button type="button" className="dropdown-item" role="menuitem" onClick={handleRename}>
            ✏️ Renomear arquivo
          </button>
          {onToggleArchived && (
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={handleToggleArchived}
            >
              {isArchived ? '📂 Desarquivar arquivo' : '📦 Arquivar arquivo'}
            </button>
          )}
          <button
            type="button"
            className="dropdown-item danger"
            role="menuitem"
            onClick={handleDelete}
          >
            🗑 Excluir arquivo
          </button>
        </div>
      )}
    </>
  )
})
