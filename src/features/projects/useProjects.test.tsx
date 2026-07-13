import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { useProjects } from './useProjects'

/** Exposes a few useProjects actions/state as clickable buttons + text so
 * tests can drive the hook the same way the real app shell does. */
function Harness() {
  const { projects, currentProject, currentFile, selectFile, createFile, restoreProjects } =
    useProjects()

  return (
    <div>
      <button onClick={() => createFile('Meu Projeto', 'notes', 'hello')}>create-file</button>
      <button
        onClick={() =>
          restoreProjects({
            'Meu Projeto': {
              backup: { name: 'backup', content: 'from drive', size: 0, timestamp: 't' },
            },
          })
        }
      >
        restore
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

  // Regression test: restore used to full-replace state, deleting any
  // local-only file/project not present in the backup. This exercises the
  // real hook (not just the pure model function) end-to-end: seed creates
  // a local file, restore brings in an unrelated file from "Drive", and
  // both must survive.
  it('restoreProjects preserves local files alongside the restored ones', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-file'))
    await waitFor(() => expect(stateText()).toContain('"notes"'))

    fireEvent.click(screen.getByText('restore'))

    await waitFor(() => {
      expect(stateText()).toContain('"notes"')
      expect(stateText()).toContain('"backup"')
    })
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
