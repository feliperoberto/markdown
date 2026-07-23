import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { useProjects } from './useProjects'

/** Exposes a few useProjects actions/state as clickable buttons + text so
 * tests can drive the hook the same way the real app shell does. */
function Harness() {
  const {
    projects,
    currentProject,
    currentFile,
    selectFile,
    createFile,
    createProject,
    moveFile,
    moveProject,
    reconcileWithRemote,
  } = useProjects()

  return (
    <div>
      <button onClick={() => createFile('Meu Projeto', 'notes', 'hello')}>create-file</button>
      <button onClick={() => createProject('Segundo')}>create-project</button>
      <button onClick={() => createFile('Segundo', 'notes', 'other')}>create-file-segundo</button>
      <button onClick={() => moveFile('Meu Projeto', 'notes', 'Segundo', null)}>move-file</button>
      <button onClick={() => moveProject('Segundo', 'Meu Projeto')}>move-project</button>
      <button
        onClick={() =>
          reconcileWithRemote({
            'Meu Projeto': {
              backup: { name: 'backup', content: 'from drive', size: 0, timestamp: 't' },
            },
          })
        }
      >
        reconcile
      </button>
      <button
        onClick={() =>
          reconcileWithRemote({
            'Meu Projeto': {
              notes: {
                name: 'notes',
                content: 'newer from drive',
                size: 0,
                timestamp: '9999-01-01T00:00:00.000Z',
              },
            },
          })
        }
      >
        reconcile-newer-remote
      </button>
      <button onClick={() => selectFile('Meu Projeto', 'notes')}>select-notes</button>
      <pre>{JSON.stringify({ projects, currentProject, currentFile })}</pre>
    </div>
  )
}

function renderHarness() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  )
}

describe('useProjects', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  // Issue #92: on first (seeded) load the first project's first file must
  // be focused, so typing edits a real file instead of nothing.
  it('focuses the seeded default file on first load', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    await waitFor(() => {
      expect(stateText()).toContain('"currentProject":"Meu Projeto"')
      expect(stateText()).toContain('"currentFile":"Sem título"')
    })
  })

  // Issue #92: a remembered last-edited file is reopened on the next visit
  // when it still exists.
  it('restores the last-edited file from storage when it still exists', async () => {
    localStorage.setItem(
      'projects',
      JSON.stringify({
        schemaVersion: 1,
        projects: {
          A: { one: { name: 'one', content: '', size: 0, timestamp: 't' } },
          B: { two: { name: 'two', content: '', size: 0, timestamp: 't' } },
        },
      }),
    )
    localStorage.setItem('lastEditedFile', JSON.stringify({ project: 'B', file: 'two' }))

    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    await waitFor(() => {
      expect(stateText()).toContain('"currentProject":"B"')
      expect(stateText()).toContain('"currentFile":"two"')
    })
  })

  it('moveFile moves a file across projects and keeps the active selection following it', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-file'))
    fireEvent.click(screen.getByText('create-project'))
    fireEvent.click(screen.getByText('select-notes'))
    await waitFor(() => expect(stateText()).toContain('"currentFile":"notes"'))

    fireEvent.click(screen.getByText('move-file'))

    await waitFor(() => {
      // The file now lives under "Segundo" and the selection followed it.
      expect(stateText()).toContain('"Segundo":{"notes"')
      expect(stateText()).toContain('"currentProject":"Segundo"')
    })
  })

  it('moveFile into a project with a same-named file is rejected with a warning toast', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-file')) // Meu Projeto/notes
    fireEvent.click(screen.getByText('create-project')) // Segundo
    fireEvent.click(screen.getByText('create-file-segundo')) // Segundo/notes
    await waitFor(() => expect(stateText()).toContain('"Segundo":{"notes"'))

    fireEvent.click(screen.getByText('move-file'))

    // Warning toast (role="status") explaining the rejected move.
    await waitFor(() => expect(screen.getByText(/Já existe um arquivo/)).not.toBeNull())
    // Both files survive untouched: the source file kept its content and the
    // target's same-named file was not overwritten (nothing moved).
    expect(stateText()).toContain('"content":"hello"')
    expect(stateText()).toContain('"content":"other"')
  })

  it('moveProject reorders the project list', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-project'))
    await waitFor(() => expect(stateText()).toContain('"Segundo"'))

    fireEvent.click(screen.getByText('move-project'))

    await waitFor(() => {
      const text = stateText()
      // "Segundo" now precedes "Meu Projeto" in the projects object.
      expect(text.indexOf('Segundo')).toBeLessThan(text.indexOf('Meu Projeto'))
    })
  })

  // Regression test: restore used to full-replace state, deleting any
  // local-only file/project not present in the backup. This exercises the
  // real hook (not just the pure model function) end-to-end: seed creates
  // a local file, reconcile brings in an unrelated file from "Drive", and
  // both must survive (union of files, per mergeProjectsByFreshness).
  it('reconcileWithRemote preserves local files alongside the remote ones', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-file'))
    await waitFor(() => expect(stateText()).toContain('"notes"'))

    fireEvent.click(screen.getByText('reconcile'))

    await waitFor(() => {
      expect(stateText()).toContain('"notes"')
      expect(stateText()).toContain('"backup"')
    })
  })

  // Smart-sync freshness: a remote file with a newer timestamp than the
  // local same-named file must overwrite it locally — this is the whole
  // point of freshness-based merge, unlike the old local-always-wins
  // restore behavior.
  it('reconcileWithRemote applies a same-named remote file when it is newer', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-file'))
    await waitFor(() => expect(stateText()).toContain('"hello"'))

    fireEvent.click(screen.getByText('reconcile-newer-remote'))

    await waitFor(() => expect(stateText()).toContain('"newer from drive"'))
    expect(stateText()).not.toContain('"hello"')
  })

  // Regression test: saveProjects() failures (QuotaExceededError, Safari
  // private-mode) used to propagate as an uncaught throw with no user
  // feedback and the UI already showing the unsaved content. persist()
  // now catches the failure, shows an error toast, and does not update
  // in-memory state.
  it('shows an error toast and does not apply the change when saving fails', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    // Mount (the first-run seed write) must succeed; only start failing
    // writes once the app is up and the user triggers a real mutation.
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })

    fireEvent.click(screen.getByText('create-file'))

    await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull())
    expect(screen.getByRole('alert').textContent).toContain('Erro ao salvar')
    // The failed create must not appear in state — nothing was persisted.
    expect(stateText()).not.toContain('"notes"')

    setItemSpy.mockRestore()
  })
})
