import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/preact'
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
function Harness() {
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
    />
  )
}

// useProjects now calls useToast() (error-toast on a failed save), so the
// hook must render inside a ToastProvider.
function renderHarness() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  )
}

describe('ProjectsSidebar + useProjects', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(showPromptDialog).mockReset()
    vi.mocked(showConfirmDialog).mockReset()
  })

  it('reflects creating, renaming and deleting a file in the sidebar tree', async () => {
    renderHarness()

    // Create a project.
    vi.mocked(showPromptDialog).mockResolvedValueOnce('My Project')
    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }))
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
})
