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

    // Rename the file.
    vi.mocked(showPromptDialog).mockResolvedValueOnce('renamed-notes')
    fireEvent.click(screen.getByRole('button', { name: 'Renomear arquivo notes' }))
    await waitFor(() => expect(screen.queryByText('renamed-notes')).not.toBeNull())
    expect(screen.queryByText('notes')).toBeNull()

    // Delete the file.
    fireEvent.click(screen.getByRole('button', { name: 'Excluir arquivo renamed-notes' }))
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
    it('hides an archived file within a project and reveals it via the per-project toggler', async () => {
      renderHarness()

      vi.mocked(showPromptDialog).mockResolvedValueOnce('notes')
      fireEvent.click(screen.getByRole('button', { name: /Mais opções do projeto Meu Projeto/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Novo arquivo/ }))
      expect(await screen.findByText('notes')).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Arquivar arquivo notes' }))

      // Leaves the project's everyday file list...
      await waitFor(() => expect(screen.queryByText('notes')).toBeNull())

      // ...and a per-project toggler appears with the count.
      const toggle = await screen.findByRole('button', { name: 'Mostrar arquivados (1)' })
      expect(toggle.getAttribute('aria-pressed')).toBe('false')

      fireEvent.click(toggle)
      expect(await screen.findByText('notes')).not.toBeNull()
      expect(
        screen.getByRole('button', { name: 'Ocultar arquivados' }).getAttribute('aria-pressed'),
      ).toBe('true')

      // Non-color-only state indicator, matching the project-badge precedent.
      expect(screen.getByRole('img', { name: 'Arquivado' })).not.toBeNull()
    })

    it('shows the all-archived-files empty state once every file in a project is archived', async () => {
      renderHarness()

      // The default seeded project has one file, "Sem título".
      fireEvent.click(screen.getByRole('button', { name: 'Arquivar arquivo Sem título' }))

      expect(
        await screen.findByText(
          'Todos os arquivos estão arquivados. Use o botão abaixo para mostrá-los.',
        ),
      ).not.toBeNull()
    })

    it('flips the button label between Arquivar/Desarquivar without a confirm dialog', async () => {
      renderHarness()

      fireEvent.click(screen.getByRole('button', { name: 'Arquivar arquivo Sem título' }))
      expect(showConfirmDialog).not.toHaveBeenCalled()

      // Reveal it, then check the button label flipped.
      fireEvent.click(await screen.findByRole('button', { name: 'Mostrar arquivados (1)' }))
      expect(
        await screen.findByRole('button', { name: 'Desarquivar arquivo Sem título' }),
      ).not.toBeNull()
    })
  })
})
