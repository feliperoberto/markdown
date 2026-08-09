import type { JSX } from 'preact'
import { memo } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { FileRow } from './FileRow'
import { showConfirmDialog, showPromptDialog } from './dialogs'
import { matchZone, stepBefore, type DragSource, type ZoneIdentity } from './dnd'
import type { ProjectFiles } from './types'
import { IconButton } from '@/components'
import { useDropdownMenu } from '@/lib/useDropdownMenu'

// Stable empty-set default for the `archivedFileNames` prop: a `= new Set()`
// default parameter would allocate a fresh Set every render and defeat
// FileRow's memo(), same reasoning as ProjectsSidebar's NO_ARCHIVED.
const NO_ARCHIVED_FILES: ReadonlySet<string> = new Set()

export interface ProjectGroupProps {
  projectName: string
  files: ProjectFiles
  isActiveProject: boolean
  /** Expanded/collapsed state, owned by the sidebar so it can be persisted (issue #92). */
  isExpanded: boolean
  /** Archive feature: hidden from the everyday list, shown via the sidebar's "Mostrar arquivados" toggler. */
  isArchived: boolean
  currentFile: string | null
  selectedFiles: ReadonlySet<string>
  projectNames: string[]
  /**
   * The sidebar's currently VISIBLE project order (already filtered to
   * what's on screen — archived projects excluded unless revealed) — used
   * by the handle's own Arrow Up/Down keyboard step (see `handleHandleKeyDown`)
   * to compute a step, matching what the user actually sees move. Computed
   * and memoized by ProjectsSidebar.
   */
  visibleProjectNames: string[]
  onSelectFile: (projectName: string, fileName: string) => void
  /** Toggles this project's expanded state; takes the name so the callback stays memo-stable. */
  onToggleExpanded: (projectName: string) => void
  /**
   * Whether THIS project's "..." actions menu is open. Owned by the sidebar
   * (not local state) so opening one project's menu closes any other
   * project's menu — or any file's menu — that was already open. See
   * ProjectsSidebar's single `openMenu` slot.
   */
  isMenuOpen: boolean
  /** Opens this project's menu, closing whichever other project's menu was open. */
  onOpenMenu: (projectName: string) => void
  /** Closes the menu, regardless of which project or file currently owns it. */
  onCloseMenu: () => void
  /**
   * Name of the file (within THIS project) whose "..." actions menu is
   * open, or null. Same single-slot ownership as `isMenuOpen` above, one
   * level down — a project's own menu and one of its files' menus can't be
   * open at once either, since both live in the sidebar's single `openMenu`
   * slot.
   */
  openFileMenu: string | null
  /** Opens a file's menu, closing whichever other project/file menu was open. */
  onOpenFileMenu: (projectName: string, fileName: string) => void
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
  // Drag & drop (issue #92, and its mobile follow-up: a Pointer Events
  // rewrite — see useSidebarDnd.ts/dnd.ts) — reorder files within this
  // project, and reorder projects.
  onMoveFile?: (projectName: string, fileName: string, beforeFile?: string | null) => void
  onMoveProject?: (projectName: string, beforeProject?: string | null) => void
  /**
   * Reordering (see ProjectsSidebar's own doc comment on its `pickedItem`
   * state for the full picture): the single project- or file-scoped item
   * currently "picked" via the handle, or null. Drives the handle's
   * `aria-pressed`, and whether this header (or one of this project's
   * files) renders as a tappable pick target.
   */
  pickedItem: DragSource | null
  /** Tap or Enter/Space on this project's own handle — toggles picking it. */
  onTapHandle: (source: DragSource) => void
  /**
   * The header (or a file row) was clicked/activated while something is
   * picked — commits if this row/header is a legal target for the current
   * pick, cancels the pick otherwise either way.
   */
  onRowActivateWhilePicked: (zone: ZoneIdentity) => void
  /** Archive feature: flips this project's archived state. */
  onToggleArchived?: (projectName: string) => void
  /**
   * Archive feature (files): plain file names (not composite keys) hidden
   * from THIS project's everyday list — pre-scoped and referentially stable
   * per project by the caller (ProjectsSidebar), so that archiving a file in
   * one project doesn't defeat this component's memo() for every other
   * project too.
   */
  archivedFileNames?: ReadonlySet<string>
  /** Archive feature (files): flips one file's archived state. */
  onToggleFileArchived?: (projectName: string, fileName: string) => void
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
  isArchived,
  currentFile,
  selectedFiles,
  projectNames,
  visibleProjectNames,
  onSelectFile,
  onToggleExpanded,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
  openFileMenu,
  onOpenFileMenu,
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
  pickedItem,
  onTapHandle,
  onRowActivateWhilePicked,
  onToggleArchived,
  archivedFileNames = NO_ARCHIVED_FILES,
  onToggleFileArchived,
}: ProjectGroupProps): JSX.Element {
  // Memoized so FileRow's memo() isn't defeated by a fresh array every
  // render (Object.keys always returns a new array reference). Kept
  // unfiltered — still feeds handleNewFile's/FileRow's rename-collision
  // validation, which must see hidden archived files too.
  const fileNames = useMemo(() => Object.keys(files), [files])
  // Archive feature (files): each project group independently shows/hides
  // its own archived files — deliberately not lifted into shared state like
  // the sidebar's `openMenu` slot, since this is inline content with no
  // cross-project exclusivity to coordinate (unlike a floating menu overlay).
  const [showArchivedFiles, setShowArchivedFiles] = useState(false)
  const visibleFileNames = useMemo(
    () =>
      showArchivedFiles ? fileNames : fileNames.filter((name) => !archivedFileNames.has(name)),
    [fileNames, archivedFileNames, showArchivedFiles],
  )
  const archivedFileCount = useMemo(
    () => fileNames.filter((name) => archivedFileNames.has(name)).length,
    [fileNames, archivedFileNames],
  )
  const {
    triggerId: menuButtonId,
    menuId,
    menuRef,
    menuPosition,
    toggleMenu,
  } = useDropdownMenu(isMenuOpen, () => onOpenMenu(projectName), onCloseMenu)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // A file's dropdown menu (unlike this project's own, a sibling of the
  // collapsible .project-files below) renders INSIDE .project-files, so
  // collapsing this project would take it to `display: none` — hidden and
  // unfocusable — while ProjectsSidebar's `openMenu` slot still thinks it's
  // open. Left alone, re-expanding the project would then show the menu
  // again at its old, possibly stale position with no further interaction.
  // Closing it up front keeps the slot's state truthful to what's onscreen.
  useEffect(() => {
    if (!isExpanded && openFileMenu !== null) onCloseMenu()
  }, [isExpanded, openFileMenu, onCloseMenu])
  const multiFileInputRef = useRef<HTMLInputElement>(null)

  // This project's zone identity, for both matching against a current pick
  // (is this header a legal target?) and reporting one of its own (a tap
  // on its own handle).
  const headerZone: ZoneIdentity = { kind: 'group', project: projectName, archived: isArchived }
  const isHandlePicked = pickedItem?.kind === 'project' && pickedItem.project === projectName
  const isHeaderPickTarget = pickedItem !== null && matchZone(headerZone, pickedItem) !== null

  // While something is picked, the header's click resolves the pick
  // (commit if it's a legal target, cancel otherwise) instead of its usual
  // expand/collapse — a plain click while picked shouldn't silently do the
  // normal thing, since that would leave the user unsure whether their tap
  // landed on the pick or on the toggle.
  function handleHeaderClick() {
    if (pickedItem) {
      onRowActivateWhilePicked(headerZone)
      return
    }
    onToggleExpanded(projectName)
  }

  function handleHeaderKeyDown(e: KeyboardEvent) {
    // Only when the keydown originated on the header itself, not a bubbled
    // event from a nested interactive descendant (the drag handle, the
    // "..." trigger) — otherwise preventDefault() here suppresses THEIR own
    // native Enter/Space activation (the browser checks defaultPrevented
    // against the original target, not this handler's own).
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleHeaderClick()
    }
  }

  // The handle's own keyboard path (issue: mobile drag & drop's "collapse
  // drag + Mover menu items onto one handle" follow-up) — Enter/Space picks
  // it up (or drops it, or cancels, via the exact same decision
  // useSidebarDnd's pointer-tap path makes: see ProjectsSidebar's
  // handleTapHandle), and while picked, Arrow Up/Down steps it immediately
  // via stepBefore — the same computation the old "Mover projeto para
  // cima/baixo" menu items used, just triggered here instead of from a
  // menu click. Escape is handled globally by ProjectsSidebar (mirrors
  // useSidebarDnd's own document-level Escape-during-drag handling), so
  // there's nothing to do for it here beyond not swallowing it.
  function handleHandleKeyDown(e: KeyboardEvent) {
    // Never let this bubble into the header's own onKeyDown (expand/
    // collapse) — same reasoning as handleHeaderKeyDown's own guard, from
    // the opposite direction.
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTapHandle({ kind: 'project', project: projectName })
      return
    }
    if (!isHandlePicked) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const step = stepBefore(visibleProjectNames, projectName, e.key === 'ArrowUp' ? -1 : 1)
      if (step) onMoveProject?.(projectName, step.before)
    }
  }

  async function handleNewFile(e: MouseEvent) {
    e.stopPropagation()
    onCloseMenu()
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
    onCloseMenu()
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
    onCloseMenu()
    const confirmed = await showConfirmDialog({
      title: 'Excluir projeto',
      message: `Excluir o projeto "${projectName}" e todos os seus arquivos? Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
    })
    if (confirmed) onDeleteProject(projectName)
  }

  // Archive feature: reversible from the same menu position, so unlike
  // delete this needs no confirm dialog.
  function handleToggleArchived(e: MouseEvent) {
    e.stopPropagation()
    onCloseMenu()
    onToggleArchived?.(projectName)
  }

  function handleExportProject(e: MouseEvent) {
    e.stopPropagation()
    onCloseMenu()
    onExportProject?.(projectName)
  }

  function handleUploadClick(e: MouseEvent) {
    e.stopPropagation()
    onCloseMenu()
    fileInputRef.current?.click()
  }

  function handleFileSelected(event: JSX.TargetedEvent<HTMLInputElement>) {
    const file = (event.target as HTMLInputElement).files?.[0]
    ;(event.target as HTMLInputElement).value = ''
    if (file) onUploadFile?.(projectName, file)
  }

  function handleUploadMultipleClick(e: MouseEvent) {
    e.stopPropagation()
    onCloseMenu()
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
      className={`project-group${isArchived ? ' archived' : ''}`}
      data-dnd-group={onMoveFile || onMoveProject ? projectName : undefined}
      data-dnd-archived={isArchived ? '1' : undefined}
      // Same attribute the drag path highlights this project's group with
      // (see useSidebarDnd.ts's setHighlight, and the `[data-drop-target]`
      // CSS comment below) — reused as-is so pick mode's "this is a legal
      // target" indicator looks identical to a live drag's, on the same
      // element.
      data-drop-target={isHeaderPickTarget ? 'true' : undefined}
    >
      <div
        className={`project-header${isActiveProject ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={handleHeaderClick}
        onDblClick={handleHeaderDoubleClick}
        onKeyDown={handleHeaderKeyDown}
      >
        {onMoveProject && !isArchived && (
          // The SOLE reorder affordance for this project — drag, tap-to-
          // pick + tap-to-drop, and keyboard grab + arrow-step all live on
          // this one handle now (no separate "Mover projeto" menu items —
          // see docs/accessibility-notes.md §4 for the WCAG 2.1 SC
          // 2.5.7/2.1.1 mapping). Focusable (unlike the old aria-hidden,
          // no-tabindex version), since it's now a real keyboard control,
          // not just a pointer-only affordance.
          <span
            className={`drag-handle${isHandlePicked ? ' picked' : ''}`}
            data-dnd-handle="project"
            role="button"
            tabIndex={0}
            aria-pressed={isHandlePicked}
            aria-label={
              isHandlePicked
                ? `Projeto ${projectName} selecionado para mover — use as setas ou toque em outro item; Escape cancela`
                : `Mover projeto ${projectName}`
            }
            onKeyDown={handleHandleKeyDown}
          >
            ⠿
          </span>
        )}
        <span className={`project-toggle${isExpanded ? ' expanded' : ''}`} aria-hidden="true">
          ▶
        </span>
        <span className="project-name">{projectName}</span>
        {isArchived && (
          // aria-label distinct from FileRow's file-level badge — see its
          // comment for why an identical accessible name across both is a
          // real ambiguity risk, not a hypothetical one.
          <span
            className="project-badge"
            role="img"
            aria-label="Projeto arquivado"
            title="Projeto arquivado"
          >
            📦
          </span>
        )}
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
          {onToggleArchived && (
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={handleToggleArchived}
            >
              {isArchived ? '📂 Desarquivar projeto' : '📦 Arquivar projeto'}
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
        ) : visibleFileNames.length === 0 ? (
          <div className="project-files-empty">
            Todos os arquivos estão arquivados. Use o botão abaixo para mostrá-los.
          </div>
        ) : (
          visibleFileNames.map((fileName) => (
            <FileRow
              key={fileName}
              projectName={projectName}
              file={files[fileName]!}
              isActive={isActiveProject && currentFile === fileName}
              isSelected={selectedFiles.has(fileName)}
              isArchived={archivedFileNames.has(fileName)}
              fileNames={fileNames}
              visibleFileNames={visibleFileNames}
              onSelectFile={onSelectFile}
              isMenuOpen={openFileMenu === fileName}
              onOpenMenu={onOpenFileMenu}
              onCloseMenu={onCloseMenu}
              onToggleSelected={onToggleSelected}
              onRenameFile={onRenameFile}
              onDeleteFile={onDeleteFile}
              onToggleArchived={onToggleFileArchived}
              onMoveFile={onMoveFile}
              pickedItem={pickedItem}
              onTapHandle={onTapHandle}
              onRowActivateWhilePicked={onRowActivateWhilePicked}
            />
          ))
        )}

        {archivedFileCount > 0 && (
          <button
            type="button"
            className={`archived-files-toggle${showArchivedFiles ? ' active' : ''}`}
            aria-pressed={showArchivedFiles}
            // aria-label names the project so this toggle's accessible name
            // stays unique across a sidebar with multiple projects — two
            // different projects can each have exactly one archived file at
            // once, which would otherwise give two buttons the identical
            // visible-text accessible name "Mostrar arquivados (1)" (and the
            // sidebar's own project-level toggle can coincidentally match
            // too). The visible label stays short; screen readers and
            // role-based queries get the disambiguated text via aria-label.
            aria-label={
              showArchivedFiles
                ? `Ocultar arquivados de ${projectName}`
                : `Mostrar arquivados de ${projectName} (${archivedFileCount})`
            }
            onClick={(e) => {
              e.stopPropagation()
              setShowArchivedFiles((v) => !v)
            }}
          >
            <span aria-hidden="true">📦</span>
            <span aria-hidden="true">
              {showArchivedFiles
                ? 'Ocultar arquivados'
                : `Mostrar arquivados (${archivedFileCount})`}
            </span>
          </button>
        )}
      </div>
    </div>
  )
})
