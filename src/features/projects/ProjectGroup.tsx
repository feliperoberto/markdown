import type { JSX } from 'preact'
import { memo } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { FileRow } from './FileRow'
import { showConfirmDialog, showPromptDialog } from './dialogs'
import { stepBefore } from './dnd'
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
   * by this project's own "Mover projeto para cima/baixo" menu items to
   * compute a step, matching what the user actually sees move. Computed
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
  /**
   * Import one or more .md files into this project — a single "Upload"
   * menu item covers both, since the file picker itself lets the user
   * choose how many to select.
   */
  onUploadFiles?: (projectName: string, files: File[]) => void
  // Drag & drop (issue #92, and its mobile follow-up: a Pointer Events
  // rewrite — see useSidebarDnd.ts/dnd.ts) — reorder files within this
  // project, and reorder projects.
  onMoveFile?: (projectName: string, fileName: string, beforeFile?: string | null) => void
  onMoveProject?: (projectName: string, beforeProject?: string | null) => void
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
  onUploadFiles,
  onMoveFile,
  onMoveProject,
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  function toggleExpanded() {
    onToggleExpanded(projectName)
  }

  function handleHeaderKeyDown(e: KeyboardEvent) {
    // Only when the keydown originated on the header itself, not a bubbled
    // event from the nested "..." trigger — otherwise preventDefault() here
    // suppresses the trigger's own native Enter/Space activation (the
    // browser checks defaultPrevented against the original target, not
    // this handler's own), making the menu unreachable by keyboard.
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleExpanded()
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

  function handleFilesSelected(event: JSX.TargetedEvent<HTMLInputElement>) {
    const files = Array.from((event.target as HTMLInputElement).files ?? [])
    ;(event.target as HTMLInputElement).value = ''
    if (files.length > 0) onUploadFiles?.(projectName, files)
  }

  // Double-click-to-rename shortcut on the project header, matching the
  // prototype (the ⋮ menu's "Renomear projeto" remains available too).
  function handleHeaderDoubleClick(e: MouseEvent) {
    e.stopPropagation()
    void handleRenameProject(e)
  }

  // --- "Mover projeto" menu items (issue: mobile drag & drop) — the
  // keyboard/non-drag path alongside the pointer drag handle below.
  // Archived projects sit outside reordering, same as the drag handle
  // being disabled for them (see the header's data-dnd-handle below).
  const moveUp =
    onMoveProject && !isArchived ? stepBefore(visibleProjectNames, projectName, -1) : null
  const moveDown =
    onMoveProject && !isArchived ? stepBefore(visibleProjectNames, projectName, 1) : null

  function handleMoveProjectUp(e: MouseEvent) {
    e.stopPropagation()
    onCloseMenu()
    if (moveUp) onMoveProject?.(projectName, moveUp.before)
  }

  function handleMoveProjectDown(e: MouseEvent) {
    e.stopPropagation()
    onCloseMenu()
    if (moveDown) onMoveProject?.(projectName, moveDown.before)
  }

  return (
    <div
      className={`project-group${isArchived ? ' archived' : ''}`}
      data-dnd-group={onMoveFile || onMoveProject ? projectName : undefined}
      data-dnd-archived={isArchived ? '1' : undefined}
    >
      <div
        className={`project-header${isActiveProject ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
        onDblClick={handleHeaderDoubleClick}
        onKeyDown={handleHeaderKeyDown}
      >
        {onMoveProject && !isArchived && (
          // Pointer-only affordance — see FileRow's identical handle for
          // the full reasoning (aria-hidden, no tabindex, the "Mover
          // projeto" menu items below are the keyboard-equivalent path).
          <span className="drag-handle" data-dnd-handle="project" aria-hidden="true">
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
          {onUploadFiles && (
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
          {moveUp && (
            <button
              type="button"
              className="dropdown-item dropdown-item-quiet"
              role="menuitem"
              onClick={handleMoveProjectUp}
            >
              ⬆ Mover projeto para cima
            </button>
          )}
          {moveDown && (
            <button
              type="button"
              className="dropdown-item dropdown-item-quiet"
              role="menuitem"
              onClick={handleMoveProjectDown}
            >
              ⬇ Mover projeto para baixo
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

      {onUploadFiles && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown"
          multiple
          hidden
          onChange={handleFilesSelected}
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
