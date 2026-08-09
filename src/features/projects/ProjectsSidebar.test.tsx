import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { useProjects } from './useProjects'
import { ProjectsSidebar } from './ProjectsSidebar'
import { ToastProvider } from '@/components'

// `ProjectsSidebar` drives project/file creation through the accessible
// `showPromptDialog`/`showConfirmDialog` modals (see `dialogs.tsx`), which
// mount their own detached Preact tree and resolve a Promise once the user
// interacts with them. That interaction pattern is exercised in isolation
// on the components-library side; here we only care about the projects
// feature's own primary flow ("create/rename/delete file → sidebar
// reflects it"), so the dialogs are stubbed to resolve immediately with a
// scripted value.
vi.mock('./dialogs', () => ({
  showPromptDialog: vi.fn(),
  showConfirmDialog: vi.fn(),
}))

import { showPromptDialog, showConfirmDialog } from './dialogs'

/** Harness wiring the real `useProjects` state hook to `ProjectsSidebar`,
 * mirroring how the app shell actually composes them. */
function Harness({
  onSelectionChange,
}: {
  onSelectionChange?: (selection: ReadonlyArray<{ projectName: string; fileName: string }>) => void
} = {}) {
  const {
    projects,
    currentProject,
    currentFile,
    selectFile,
    createProject,
    createFile,
    renameFile,
    deleteFile,
    renameProject,
    deleteProject,
    archivedProjects,
    toggleProjectArchived,
    archivedFiles,
    toggleFileArchived,
    moveFile,
    moveProject,
  } = useProjects()

  return (
    <ProjectsSidebar
      projects={projects}
      currentProject={currentProject}
      currentFile={currentFile}
      onSelectFile={selectFile}
      onCreateProject={createProject}
      onCreateFile={createFile}
      onRenameFile={renameFile}
      onDeleteFile={deleteFile}
      onRenameProject={renameProject}
      onDeleteProject={deleteProject}
      archivedProjects={archivedProjects}
      onToggleArchived={toggleProjectArchived}
      archivedFiles={archivedFiles}
      onToggleFileArchived={toggleFileArchived}
      onSelectionChange={onSelectionChange}
      onMoveFile={moveFile}
      onMoveProject={moveProject}
    />
  )
}

// useProjects now calls useToast() (error-toast on a failed save), so the
// hook must render inside a ToastProvider.
function renderHarness(
  props: {
    onSelectionChange?: (
      selection: ReadonlyArray<{ projectName: string; fileName: string }>,
    ) => void
  } = {},
) {
  return render(
    <ToastProvider>
      <Harness {...props} />
    </ToastProvider>,
  )
}

describe('ProjectsSidebar + useProjects', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(showPromptDialog).mockReset()
    vi.mocked(showConfirmDialog).mockReset()
  })

  // Auto-cleanup from @testing-library/preact only registers itself when
  // `afterEach` exists as a global (see its index.mjs); this project runs
  // Vitest with `globals: false`, so without this explicit call each
  // additional test in this file would render on top of the previous
  // test's leftover DOM. The original single-test file didn't need it —
  // this now has several.
  afterEach(() => {
    cleanup()
  })

  it('reflects creating, renaming and deleting a file in the sidebar tree', async () => {
    renderHarness()

    // Create a project.
    vi.mocked(showPromptDialog).mockResolvedValueOnce('My Project')
    fireEvent.click(screen.getByRole('button', { name: 'Criar novo projeto' }))
    expect(await screen.findByText('My Project')).not.toBeNull()

    // Open the project's "..." menu and create a file inside it. Menu
    // items are role="menuitem" (issue: the menu previously had no real
    // menu semantics/keyboard nav), not the implicit "button" role.
    vi.mocked(showPromptDialog).mockResolvedValueOnce('notes')
    fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto My Project/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Novo arquivo/ }))
    expect(await screen.findByText('notes')).not.toBeNull()

    // Rename the file, via its own "..." actions menu.
    vi.mocked(showPromptDialog).mockResolvedValueOnce('renamed-notes')
    fireEvent.click(screen.getByRole('button', { name: 'Mais opções do arquivo notes' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Renomear$/ }))
    await waitFor(() => expect(screen.queryByText('renamed-notes')).not.toBeNull())
    expect(screen.queryByText('notes')).toBeNull()

    // Delete the file.
    fireEvent.click(screen.getByRole('button', { name: 'Mais opções do arquivo renamed-notes' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Excluir$/ }))
    await waitFor(() => expect(screen.queryByText('renamed-notes')).toBeNull())
  })

  describe('project actions menu', () => {
    it('closes a project menu when another project menu is opened', async () => {
      renderHarness()

      vi.mocked(showPromptDialog).mockResolvedValueOnce('Segundo')
      fireEvent.click(screen.getByRole('button', { name: 'Criar novo projeto' }))
      expect(await screen.findByText('Segundo')).not.toBeNull()

      // The default seeded project is "Meu Projeto".
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      expect(screen.getByRole('menu', { name: /Ações do projeto Meu Projeto/ })).not.toBeNull()

      // Opening the second project's menu must close the first one instead
      // of leaving both open (bug: each menu previously tracked its own
      // open/closed state independently).
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Segundo/ }))
      expect(screen.getByRole('menu', { name: /Ações do projeto Segundo/ })).not.toBeNull()
      expect(screen.queryByRole('menu', { name: /Ações do projeto Meu Projeto/ })).toBeNull()
    })

    it('closes the open menu on an outside click', async () => {
      renderHarness()

      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      expect(screen.getByRole('menu', { name: /Ações do projeto Meu Projeto/ })).not.toBeNull()

      fireEvent.click(document.body)
      expect(screen.queryByRole('menu', { name: /Ações do projeto Meu Projeto/ })).toBeNull()
    })

    it('closes the open menu on a click that stops its own propagation (e.g. a file checkbox)', async () => {
      renderHarness()

      // Seed a file so its select checkbox exists.
      vi.mocked(showPromptDialog).mockResolvedValueOnce('notes')
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Novo arquivo/ }))
      expect(await screen.findByText('notes')).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      expect(screen.getByRole('menu', { name: /Ações do projeto Meu Projeto/ })).not.toBeNull()

      // The file's select checkbox calls stopPropagation() so its click
      // doesn't also trigger the row's own onClick (FileRow.tsx). A
      // bubble-phase outside-click listener would never see this click at
      // all, silently leaving the menu open (bug this test guards against).
      fireEvent.click(screen.getByRole('checkbox', { name: /Selecionar notes/ }))
      expect(screen.queryByRole('menu', { name: /Ações do projeto Meu Projeto/ })).toBeNull()
    })
  })

  describe('archive feature', () => {
    it('hides an archived project by default and reveals it via the toggler', async () => {
      renderHarness()

      vi.mocked(showPromptDialog).mockResolvedValueOnce('Segundo')
      fireEvent.click(screen.getByRole('button', { name: 'Criar novo projeto' }))
      expect(await screen.findByText('Segundo')).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Segundo/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar projeto/ }))

      // Leaves the everyday list...
      await waitFor(() => expect(screen.queryByText('Segundo')).toBeNull())

      // ...and the toggler appears with the count.
      const toggle = await screen.findByRole('button', { name: 'Mostrar arquivados (1)' })
      expect(toggle.getAttribute('aria-pressed')).toBe('false')

      fireEvent.click(toggle)
      expect(await screen.findByText('Segundo')).not.toBeNull()
      expect(
        screen.getByRole('button', { name: 'Ocultar arquivados' }).getAttribute('aria-pressed'),
      ).toBe('true')
    })

    it('shows no toggler when nothing is archived', () => {
      renderHarness()
      expect(screen.queryByRole('button', { name: /arquivados/i })).toBeNull()
    })

    it('shows the all-archived empty state once the only project is archived', async () => {
      renderHarness()

      // The default seeded project is "Meu Projeto".
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar projeto/ }))

      expect(
        await screen.findByText(
          'Todos os projetos estão arquivados. Use o botão abaixo para mostrá-los.',
        ),
      ).not.toBeNull()
    })

    it('flips the menu label between Arquivar/Desarquivar without a confirm dialog', async () => {
      renderHarness()

      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar projeto/ }))
      expect(showConfirmDialog).not.toHaveBeenCalled()

      // Reveal it, then open its menu again to check the label flipped.
      fireEvent.click(await screen.findByRole('button', { name: 'Mostrar arquivados (1)' }))
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      expect(await screen.findByRole('menuitem', { name: /Desarquivar projeto/ })).not.toBeNull()
    })

    it('drops a checked file from the batch selection when its project is archived', async () => {
      const onSelectionChange = vi.fn()
      renderHarness({ onSelectionChange })

      vi.mocked(showPromptDialog).mockResolvedValueOnce('notes')
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Novo arquivo/ }))
      expect(await screen.findByText('notes')).not.toBeNull()

      fireEvent.click(screen.getByRole('checkbox', { name: /Selecionar notes/ }))
      await waitFor(() =>
        expect(onSelectionChange).toHaveBeenLastCalledWith([
          { projectName: 'Meu Projeto', fileName: 'notes' },
        ]),
      )

      onSelectionChange.mockClear()
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar projeto/ }))

      await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith([]))
    })
  })

  describe('archive files feature', () => {
    // Regression: mirrors the project-level test above ("drops a checked
    // file from the batch selection when its project is archived") — the
    // same off-screen-behind-the-toggler reasoning applies one level down
    // when the individual FILE (not its project) is archived, but the
    // pruning effect wasn't extended to check it.
    it('drops a checked file from the batch selection when the file itself is archived', async () => {
      const onSelectionChange = vi.fn()
      renderHarness({ onSelectionChange })

      vi.mocked(showPromptDialog).mockResolvedValueOnce('notes')
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Novo arquivo/ }))
      expect(await screen.findByText('notes')).not.toBeNull()

      fireEvent.click(screen.getByRole('checkbox', { name: /Selecionar notes/ }))
      await waitFor(() =>
        expect(onSelectionChange).toHaveBeenLastCalledWith([
          { projectName: 'Meu Projeto', fileName: 'notes' },
        ]),
      )

      onSelectionChange.mockClear()
      fireEvent.click(screen.getByRole('button', { name: 'Mais opções do arquivo notes' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar$/ }))

      await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith([]))
    })

    it('hides an archived file within a project and reveals it via the per-project toggler', async () => {
      renderHarness()

      vi.mocked(showPromptDialog).mockResolvedValueOnce('notes')
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Novo arquivo/ }))
      expect(await screen.findByText('notes')).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Mais opções do arquivo notes' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar$/ }))

      // Leaves the project's everyday file list...
      await waitFor(() => expect(screen.queryByText('notes')).toBeNull())

      // ...and a per-project toggler appears with the count. Its accessible
      // name includes the project name (unlike its shorter visible text) so
      // it stays unique from another project's identically-counted toggler
      // or from the sidebar's own project-level toggler.
      const toggle = await screen.findByRole('button', {
        name: 'Mostrar arquivados de Meu Projeto (1)',
      })
      expect(toggle.getAttribute('aria-pressed')).toBe('false')

      fireEvent.click(toggle)
      expect(await screen.findByText('notes')).not.toBeNull()
      expect(
        screen
          .getByRole('button', { name: 'Ocultar arquivados de Meu Projeto' })
          .getAttribute('aria-pressed'),
      ).toBe('true')

      // Non-color-only state indicator, matching the project-badge precedent.
      // Its own accessible name ("Arquivo arquivado") is distinct from a
      // project's ("Projeto arquivado") so the two remain distinguishable
      // when both are visible at once.
      expect(screen.getByRole('img', { name: 'Arquivo arquivado' })).not.toBeNull()
    })

    it('shows the all-archived-files empty state once every file in a project is archived', async () => {
      renderHarness()

      // The default seeded project has one file, "Sem título".
      fireEvent.click(screen.getByRole('button', { name: 'Mais opções do arquivo Sem título' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar$/ }))

      expect(
        await screen.findByText(
          'Todos os arquivos estão arquivados. Use o botão abaixo para mostrá-los.',
        ),
      ).not.toBeNull()
    })

    it('flips the menu item label between Arquivar/Desarquivar without a confirm dialog', async () => {
      renderHarness()

      fireEvent.click(screen.getByRole('button', { name: 'Mais opções do arquivo Sem título' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar$/ }))
      expect(showConfirmDialog).not.toHaveBeenCalled()

      // Reveal it, reopen its menu, then check the item label flipped.
      fireEvent.click(
        await screen.findByRole('button', { name: 'Mostrar arquivados de Meu Projeto (1)' }),
      )
      fireEvent.click(
        await screen.findByRole('button', { name: 'Mais opções do arquivo Sem título' }),
      )
      expect(await screen.findByRole('menuitem', { name: /Desarquivar$/ })).not.toBeNull()
    })
  })

  // Coverage-reachability fix (regression-analysis cause b): the harness now
  // wires `onMoveFile`/`onMoveProject` through to `useProjects`, so reorder
  // is reachable from a component-level test, not just the pure
  // `dnd.ts`/`useSidebarDnd.ts` unit suites. The old "Mover para cima/baixo"
  // menu items are gone — reordering is now the drag handle's keyboard path
  // (Enter/Space to pick, Arrow Up/Down to step, Escape/re-tap/another row
  // to drop) — same underlying eligibility rules (same-project-only,
  // archived-group excluded), different trigger mechanism.
  describe('drag handle keyboard reorder (pick mode)', () => {
    function fileNamesInOrder(): string[] {
      return Array.from(document.querySelectorAll('.file-name')).map((el) => el.textContent ?? '')
    }

    function projectNamesInOrder(): string[] {
      return Array.from(document.querySelectorAll('.project-name')).map(
        (el) => el.textContent ?? '',
      )
    }

    it('picking a file handle and activating another same-project row commits the reorder', async () => {
      renderHarness()

      vi.mocked(showPromptDialog).mockResolvedValueOnce('segundo-arquivo')
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Novo arquivo/ }))
      expect(await screen.findByText('segundo-arquivo')).not.toBeNull()
      expect(fileNamesInOrder()).toEqual(['Sem título', 'segundo-arquivo'])

      fireEvent.keyDown(screen.getByRole('button', { name: 'Mover arquivo segundo-arquivo' }), {
        key: 'Enter',
      })
      expect(
        screen.getByRole('button', { name: /segundo-arquivo selecionado para mover/ }),
      ).not.toBeNull()

      fireEvent.click(screen.getByText('Sem título'))
      expect(fileNamesInOrder()).toEqual(['segundo-arquivo', 'Sem título'])
      // The pick clears once the move commits.
      expect(screen.getByRole('button', { name: 'Mover arquivo segundo-arquivo' })).not.toBeNull()
    })

    it('re-activating the same handle cancels the pick', async () => {
      renderHarness()

      const handle = screen.getByRole('button', { name: 'Mover arquivo Sem título' })
      fireEvent.keyDown(handle, { key: 'Enter' })
      expect(handle.getAttribute('aria-pressed')).toBe('true')

      fireEvent.keyDown(handle, { key: ' ' })
      expect(handle.getAttribute('aria-pressed')).toBe('false')
    })

    it('Escape cancels an active pick', () => {
      renderHarness()

      const handle = screen.getByRole('button', { name: 'Mover arquivo Sem título' })
      fireEvent.keyDown(handle, { key: 'Enter' })
      expect(handle.getAttribute('aria-pressed')).toBe('true')

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(handle.getAttribute('aria-pressed')).toBe('false')
    })

    it('activating a row in a different project cancels the pick without moving (cross-project move is not supported)', async () => {
      renderHarness()

      vi.mocked(showPromptDialog).mockResolvedValueOnce('Outro Projeto')
      fireEvent.click(screen.getByRole('button', { name: 'Criar novo projeto' }))
      expect(await screen.findByText('Outro Projeto')).not.toBeNull()

      const handle = screen.getByRole('button', { name: 'Mover arquivo Sem título' })
      fireEvent.keyDown(handle, { key: 'Enter' })
      expect(handle.getAttribute('aria-pressed')).toBe('true')

      fireEvent.click(screen.getByText('Outro Projeto'))
      expect(handle.getAttribute('aria-pressed')).toBe('false')
      expect(fileNamesInOrder()).toEqual(['Sem título'])
    })

    it('Arrow Up/Down at the ends of the visible file list is a no-op', async () => {
      renderHarness()

      vi.mocked(showPromptDialog).mockResolvedValueOnce('segundo-arquivo')
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Novo arquivo/ }))
      expect(await screen.findByText('segundo-arquivo')).not.toBeNull()

      const first = screen.getByRole('button', { name: 'Mover arquivo Sem título' })
      fireEvent.keyDown(first, { key: 'Enter' })
      fireEvent.keyDown(first, { key: 'ArrowUp' })
      expect(fileNamesInOrder()).toEqual(['Sem título', 'segundo-arquivo'])
      fireEvent.keyDown(first, { key: 'Escape' })

      const last = screen.getByRole('button', { name: 'Mover arquivo segundo-arquivo' })
      fireEvent.keyDown(last, { key: 'Enter' })
      fireEvent.keyDown(last, { key: 'ArrowDown' })
      expect(fileNamesInOrder()).toEqual(['Sem título', 'segundo-arquivo'])
    })

    it('picking a project handle and arrow-stepping reorders projects', async () => {
      renderHarness()

      vi.mocked(showPromptDialog).mockResolvedValueOnce('Segundo')
      fireEvent.click(screen.getByRole('button', { name: 'Criar novo projeto' }))
      expect(await screen.findByText('Segundo')).not.toBeNull()
      expect(projectNamesInOrder()).toEqual(['Meu Projeto', 'Segundo'])

      const handle = screen.getByRole('button', { name: 'Mover projeto Meu Projeto' })
      fireEvent.keyDown(handle, { key: 'Enter' })
      fireEvent.keyDown(handle, { key: 'ArrowDown' })
      expect(projectNamesInOrder()).toEqual(['Segundo', 'Meu Projeto'])
    })

    it("an archived project's own handle is not rendered (it is not a valid pick source)", async () => {
      renderHarness()

      vi.mocked(showPromptDialog).mockResolvedValueOnce('Segundo')
      fireEvent.click(screen.getByRole('button', { name: 'Criar novo projeto' }))
      expect(await screen.findByText('Segundo')).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Segundo/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar projeto/ }))
      await waitFor(() => expect(screen.queryByText('Segundo')).toBeNull())

      fireEvent.click(await screen.findByRole('button', { name: 'Mostrar arquivados (1)' }))
      expect(screen.queryByRole('button', { name: 'Mover projeto Segundo' })).toBeNull()
    })

    // Regression: deleting/renaming/archiving the picked file (or project)
    // out from under an active pick, via its own still-open "..." menu,
    // used to leave `pickedItem` pointing at a source that no longer
    // visibly exists — every other same-project row kept rendering as a
    // legal drop target for nothing. ProjectsSidebar now clears the pick in
    // that case, mirroring the equivalent effect it already had for a
    // dangling `openMenu`.
    it('deleting the picked file via its own "..." menu clears the pick', async () => {
      renderHarness()

      const handle = screen.getByRole('button', { name: 'Mover arquivo Sem título' })
      fireEvent.keyDown(handle, { key: 'Enter' })
      expect(handle.getAttribute('aria-pressed')).toBe('true')

      fireEvent.click(screen.getByRole('button', { name: 'Mais opções do arquivo Sem título' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Excluir$/ }))
      await waitFor(() => expect(screen.queryByText('Sem título')).toBeNull())

      expect(screen.queryByRole('button', { name: /selecionado para mover/ })).toBeNull()
    })

    it('archiving the picked file via its own "..." menu clears the pick', async () => {
      renderHarness()

      const handle = screen.getByRole('button', { name: 'Mover arquivo Sem título' })
      fireEvent.keyDown(handle, { key: 'Enter' })
      expect(handle.getAttribute('aria-pressed')).toBe('true')

      fireEvent.click(screen.getByRole('button', { name: 'Mais opções do arquivo Sem título' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar$/ }))
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Mover arquivo Sem título' })).toBeNull(),
      )

      expect(screen.queryByRole('button', { name: /selecionado para mover/ })).toBeNull()
    })

    it('archiving the picked project via its own "..." menu clears the pick', async () => {
      renderHarness()

      const handle = screen.getByRole('button', { name: 'Mover projeto Meu Projeto' })
      fireEvent.keyDown(handle, { key: 'Enter' })
      expect(handle.getAttribute('aria-pressed')).toBe('true')

      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Arquivar projeto/ }))
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Mover projeto Meu Projeto' })).toBeNull(),
      )

      expect(screen.queryByRole('button', { name: /selecionado para mover/ })).toBeNull()
    })

    // Regression: `matchZone` used to match a zone against ITSELF (a picked
    // file's own row, or a picked project's own header), so the picked
    // source highlighted as if it were also a legal drop target for itself.
    it("a picked file's own row is never highlighted as a drop target for itself", async () => {
      renderHarness()

      vi.mocked(showPromptDialog).mockResolvedValueOnce('segundo-arquivo')
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Novo arquivo/ }))
      expect(await screen.findByText('segundo-arquivo')).not.toBeNull()

      const handle = screen.getByRole('button', { name: 'Mover arquivo Sem título' })
      fireEvent.keyDown(handle, { key: 'Enter' })

      const ownRow = document
        .querySelector('.file-name')
        ?.closest('.file-item') as HTMLElement | null
      expect(ownRow?.getAttribute('data-drop-target')).toBeNull()

      const otherRow = screen.getByText('segundo-arquivo').closest('.file-item')
      expect(otherRow?.getAttribute('data-drop-target')).toBe('true')
    })

    it("a picked project's own header is never highlighted as a drop target for itself", async () => {
      renderHarness()

      const handle = screen.getByRole('button', { name: 'Mover projeto Meu Projeto' })
      fireEvent.keyDown(handle, { key: 'Enter' })

      const ownGroup = handle.closest('.project-group')
      expect(ownGroup?.getAttribute('data-drop-target')).toBeNull()
    })
  })
})
