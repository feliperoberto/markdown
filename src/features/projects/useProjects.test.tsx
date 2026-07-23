import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { useProjects } from './useProjects'

/** Exposes a few useProjects actions/state as clickable buttons + text so
 * tests can drive the hook the same way the real app shell does. */
function Harness() {
  const { projects, currentProject, currentFile, selectFile, createFile, reconcileWithRemote } =
    useProjects()

  return (
    <div>
      <button onClick={() => createFile('Meu Projeto', 'notes', 'hello')}>create-file</button>
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
