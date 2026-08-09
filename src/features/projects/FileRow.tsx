import type { JSX } from 'preact'
import { memo } from 'preact/compat'
import type { ProjectFile } from './types'
import { showPromptDialog } from './dialogs'
import { matchZone, stepBefore, type DragSource, type ZoneIdentity } from './dnd'
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
  /**
   * This project's currently VISIBLE file order (already filtered to what's
   * on screen — archived files excluded unless revealed) — used by the
   * handle's own Arrow Up/Down keyboard step (see `handleHandleKeyDown`) to
   * compute a step, matching what the user actually sees move. Computed and
   * memoized by ProjectGroup.
   */
  visibleFileNames: string[]
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
   * Drag & drop (issue #92, and its mobile follow-up: a Pointer Events
   * rewrite so this also works from a touch gesture, not just a mouse).
   * When provided, the row's drag handle is active — see
   * `useSidebarDnd`/`./dnd.ts`, which own the actual gesture/drop-
   * resolution logic; this component only supplies the `data-dnd-*`
   * identity attributes the delegated pointer handler reads. Moving a file
   * to a DIFFERENT project was removed (see CHANGELOG) — a move only ever
   * reorders within `projectName`.
   */
  onMoveFile?: (projectName: string, fileName: string, beforeFile?: string | null) => void
  /**
   * Reordering: the single project- or file-scoped item currently "picked"
   * via a handle, or null — see ProjectsSidebar's own doc comment on its
   * `pickedItem` state for the full picture. Drives this row's handle's
   * `aria-pressed`, and whether the row itself renders as a tappable pick
   * target.
   */
  pickedItem: DragSource | null
  /** Tap or Enter/Space on this file's own handle — toggles picking it. */
  onTapHandle: (source: DragSource) => void
  /**
   * This row was clicked/activated while something is picked — commits if
   * it's a legal target for the current pick, cancels the pick otherwise
   * either way.
   */
  onRowActivateWhilePicked: (zone: ZoneIdentity) => void
}

// Renders one file row in the sidebar tree, including its "..." actions
// menu (rename/archive/delete) and the multi-select checkbox used for
// batch download. Wrapped in memo() so editing the active file's content
// doesn't reconcile every OTHER file row in the sidebar on every
// keystroke — effective only as long as `fileNames`/`visibleFileNames` are
// themselves stable references (see ProjectGroup, which memoizes them),
// since a fresh array every render would defeat this.
export const FileRow = memo(function FileRow({
  projectName,
  file,
  isActive,
  isSelected,
  isArchived,
  fileNames,
  visibleFileNames,
  onSelectFile,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
  onToggleSelected,
  onRenameFile,
  onDeleteFile,
  onToggleArchived,
  onMoveFile,
  pickedItem,
  onTapHandle,
  onRowActivateWhilePicked,
}: FileRowProps): JSX.Element {
  const {
    triggerId: menuButtonId,
    menuId,
    menuRef,
    menuPosition,
    toggleMenu,
  } = useDropdownMenu(isMenuOpen, () => onOpenMenu(projectName, file.name), onCloseMenu)

  // This row's zone identity, for both matching against a current pick (is
  // this row a legal target?) and reporting one of its own (a tap on its
  // own handle).
  const rowZone: ZoneIdentity = { kind: 'file', project: projectName, file: file.name }
  const isHandlePicked =
    pickedItem?.kind === 'file' &&
    pickedItem.project === projectName &&
    pickedItem.file === file.name
  const isRowPickTarget = pickedItem !== null && matchZone(rowZone, pickedItem) !== null

  // While something is picked, the row's click resolves the pick (commit if
  // it's a legal target, cancel otherwise) instead of its usual open-file —
  // same reasoning as ProjectGroup's identical header-click branching.
  function handleRowClick() {
    if (pickedItem) {
      onRowActivateWhilePicked(rowZone)
      return
    }
    onSelectFile(projectName, file.name)
  }

  function handleRowKeyDown(e: KeyboardEvent) {
    // Only when the keydown originated on the row itself, not a bubbled
    // event from a nested interactive descendant (the checkbox, the drag
    // handle, the "..." trigger) — otherwise preventDefault() here
    // suppresses THEIR native Enter/Space activation too (the browser
    // checks defaultPrevented against the original target, not this
    // handler's own), so e.g. the "..." button could never be activated by
    // keyboard at all.
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleRowClick()
    }
  }

  // The handle's own keyboard path — see ProjectGroup's identical
  // handleHandleKeyDown for the full reasoning (Enter/Space picks/drops/
  // cancels via the same decision the pointer-tap path makes; Arrow Up/Down
  // steps immediately via stepBefore while picked; Escape is handled
  // globally by ProjectsSidebar).
  function handleHandleKeyDown(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTapHandle({ kind: 'file', project: projectName, file: file.name })
      return
    }
    if (!isHandlePicked) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const step = stepBefore(visibleFileNames, file.name, e.key === 'ArrowUp' ? -1 : 1)
      if (step) onMoveFile?.(projectName, file.name, step.before)
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
        className={`file-item${isActive ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        aria-current={isActive ? 'true' : undefined}
        data-dnd-file={onMoveFile ? file.name : undefined}
        data-dnd-file-project={onMoveFile ? projectName : undefined}
        data-drop-target={isRowPickTarget ? 'true' : undefined}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
      >
        {onMoveFile && (
          // The SOLE reorder affordance for this file — drag, tap-to-pick +
          // tap-to-drop, and keyboard grab + arrow-step all live on this
          // one handle now (no separate "Mover para cima/baixo" menu items
          // — see docs/accessibility-notes.md §4 for the WCAG 2.1 SC
          // 2.5.7/2.1.1 mapping). Focusable (unlike the old aria-hidden,
          // no-tabindex version), since it's now a real keyboard control,
          // not just a pointer-only affordance. `touch-action: none`
          // (global.css) is what keeps a finger here from also panning the
          // sidebar while dragging.
          <span
            className={`drag-handle${isHandlePicked ? ' picked' : ''}`}
            data-dnd-handle="file"
            role="button"
            tabIndex={0}
            aria-pressed={isHandlePicked}
            aria-label={
              isHandlePicked
                ? `Arquivo ${file.name} selecionado para mover — use as setas ou toque em outro item; Escape cancela`
                : `Mover arquivo ${file.name}`
            }
            onKeyDown={handleHandleKeyDown}
          >
            ⠿
          </span>
        )}
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
          className="file-menu-trigger"
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
            ✏️ Renomear
          </button>
          {onToggleArchived && (
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={handleToggleArchived}
            >
              {isArchived ? '📂 Desarquivar' : '📦 Arquivar'}
            </button>
          )}
          <button
            type="button"
            className="dropdown-item danger"
            role="menuitem"
            onClick={handleDelete}
          >
            🗑 Excluir
          </button>
        </div>
      )}
    </>
  )
})
