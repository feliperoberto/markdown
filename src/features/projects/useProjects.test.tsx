import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { encodeArchivedFileKey } from './model'
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
    renameProject,
    deleteProject,
    renameFile,
    deleteFile,
    moveFile,
    moveProject,
    archivedProjects,
    toggleProjectArchived,
    archivedFiles,
    toggleFileArchived,
    reconcileWithRemote,
  } = useProjects()

  return (
    <div>
      <button onClick={() => createFile('Meu Projeto', 'notes', 'hello')}>create-file</button>
      <button onClick={() => createProject('Segundo')}>create-project</button>
      <button onClick={() => createFile('Segundo', 'notes', 'other')}>create-file-segundo</button>
      <button onClick={() => moveFile('Meu Projeto', 'notes', 'Segundo', null)}>move-file</button>
      <button onClick={() => moveProject('Segundo', 'Meu Projeto')}>move-project</button>
      <button onClick={() => toggleProjectArchived('Meu Projeto')}>
        toggle-archive-meu-projeto
      </button>
      <button onClick={() => toggleProjectArchived('Segundo')}>toggle-archive-segundo</button>
      <button onClick={() => renameProject('Meu Projeto', 'Renomeado')}>rename-meu-projeto</button>
      <button onClick={() => deleteProject('Meu Projeto')}>delete-meu-projeto</button>
      <button onClick={() => toggleFileArchived('Meu Projeto', 'notes')}>
        toggle-archive-file-notes
      </button>
      <button onClick={() => toggleFileArchived('Meu Projeto', 'Sem título')}>
        toggle-archive-file-sem-titulo
      </button>
      <button onClick={() => renameFile('Meu Projeto', 'notes', 'notas')}>rename-file-notes</button>
      <button onClick={() => deleteFile('Meu Projeto', 'notes')}>delete-file-notes</button>
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
      <button onClick={() => selectFile('Meu Projeto', 'Sem título')}>select-sem-titulo</button>
      <pre>{JSON.stringify({ projects, currentProject, currentFile })}</pre>
      <pre id="archived">{JSON.stringify([...archivedProjects].sort())}</pre>
      <pre id="archivedFiles">{JSON.stringify([...archivedFiles].sort())}</pre>
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
  // be focused (the fallback when nothing is remembered yet).
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

  describe('archive feature', () => {
    it('toggleProjectArchived archives and unarchives, persisting the set', async () => {
      const { container } = renderHarness()
      const archivedText = () => container.querySelector('#archived')?.textContent ?? ''

      await waitFor(() => expect(archivedText()).toBe('[]'))

      fireEvent.click(screen.getByText('toggle-archive-meu-projeto'))
      await waitFor(() => expect(archivedText()).toBe('["Meu Projeto"]'))
      expect(JSON.parse(localStorage.getItem('archivedProjects') ?? '[]')).toEqual(['Meu Projeto'])

      fireEvent.click(screen.getByText('toggle-archive-meu-projeto'))
      await waitFor(() => expect(archivedText()).toBe('[]'))
      expect(JSON.parse(localStorage.getItem('archivedProjects') ?? '[]')).toEqual([])
    })

    it('archiving the currently-open project moves the selection to the first visible file', async () => {
      const { container } = renderHarness()
      const stateText = () => container.querySelector('pre')?.textContent ?? ''

      fireEvent.click(screen.getByText('create-file')) // Meu Projeto/notes
      fireEvent.click(screen.getByText('create-project')) // Segundo (also selects it)
      fireEvent.click(screen.getByText('create-file-segundo')) // Segundo/notes
      // Re-select Meu Projeto/notes so it's the active project before archiving.
      fireEvent.click(screen.getByText('select-notes'))
      await waitFor(() => expect(stateText()).toContain('"currentProject":"Meu Projeto"'))

      // Archiving the active project ("Meu Projeto") should move the
      // selection to the first file of the next visible project.
      fireEvent.click(screen.getByText('toggle-archive-meu-projeto'))

      await waitFor(() => {
        expect(stateText()).toContain('"currentProject":"Segundo"')
        expect(stateText()).toContain('"currentFile":"notes"')
      })
    })

    it('renaming an archived project carries the archived flag to the new name', async () => {
      const { container } = renderHarness()
      const archivedText = () => container.querySelector('#archived')?.textContent ?? ''

      fireEvent.click(screen.getByText('toggle-archive-meu-projeto'))
      await waitFor(() => expect(archivedText()).toBe('["Meu Projeto"]'))

      fireEvent.click(screen.getByText('rename-meu-projeto'))
      await waitFor(() => expect(archivedText()).toBe('["Renomeado"]'))
    })

    it('deleting an archived project drops it from the archived set', async () => {
      const { container } = renderHarness()
      const archivedText = () => container.querySelector('#archived')?.textContent ?? ''

      fireEvent.click(screen.getByText('toggle-archive-meu-projeto'))
      await waitFor(() => expect(archivedText()).toBe('["Meu Projeto"]'))

      fireEvent.click(screen.getByText('delete-meu-projeto'))
      await waitFor(() => expect(archivedText()).toBe('[]'))
    })

    // Regression test: archiving the last still-visible project used to
    // null out currentProject/currentFile even when an already-archived
    // project still had a file — leaving a blank, non-persisting editor —
    // instead of falling back to it the way resolveInitialSelection does
    // for the identical all-archived state on boot.
    it("archiving the last visible project falls back to an archived project's file instead of nulling the selection", async () => {
      const { container } = renderHarness()
      const stateText = () => container.querySelector('pre')?.textContent ?? ''

      // Archive "Segundo" first (it has no files) — the selection re-points
      // back to the seeded "Meu Projeto"/"Sem título".
      fireEvent.click(screen.getByText('create-project')) // Segundo
      fireEvent.click(screen.getByText('toggle-archive-segundo'))
      await waitFor(() => expect(stateText()).toContain('"currentProject":"Meu Projeto"'))

      // Now archive the only remaining visible project.
      fireEvent.click(screen.getByText('toggle-archive-meu-projeto'))

      await waitFor(() => {
        expect(stateText()).toContain('"currentProject":"Meu Projeto"')
        expect(stateText()).toContain('"currentFile":"Sem título"')
      })
    })

    // Regression test: a failed delete write (e.g. quota exceeded) used to
    // still drop the project from the archived set even though the project
    // itself was never removed — it silently reappeared in the everyday
    // list despite persist() never having landed.
    it('a failed delete does not un-archive the project', async () => {
      const { container } = renderHarness()
      const archivedText = () => container.querySelector('#archived')?.textContent ?? ''
      const stateText = () => container.querySelector('pre')?.textContent ?? ''

      fireEvent.click(screen.getByText('toggle-archive-meu-projeto'))
      await waitFor(() => expect(archivedText()).toBe('["Meu Projeto"]'))

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      })

      fireEvent.click(screen.getByText('delete-meu-projeto'))
      await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull())
      setItemSpy.mockRestore()

      // The delete never reached storage, so the project still exists and
      // must still be archived.
      expect(stateText()).toContain('"Meu Projeto"')
      expect(archivedText()).toBe('["Meu Projeto"]')
    })

    // A last-edited pointer into a project the user has since archived must
    // not reopen the very thing they hid — the next visible file should be
    // selected instead.
    it('boot selection skips a last-edited file whose project is archived', async () => {
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
      localStorage.setItem('lastEditedFile', JSON.stringify({ project: 'A', file: 'one' }))
      localStorage.setItem('archivedProjects', JSON.stringify(['A']))

      const { container } = renderHarness()
      const stateText = () => container.querySelector('pre')?.textContent ?? ''

      await waitFor(() => {
        expect(stateText()).toContain('"currentProject":"B"')
        expect(stateText()).toContain('"currentFile":"two"')
      })
    })
  })

  describe('archive files feature', () => {
    it('toggleFileArchived archives and unarchives, persisting the set', async () => {
      const { container } = renderHarness()
      const archivedFilesText = () => container.querySelector('#archivedFiles')?.textContent ?? ''
      const key = encodeArchivedFileKey('Meu Projeto', 'Sem título')

      await waitFor(() => expect(archivedFilesText()).toBe('[]'))

      fireEvent.click(screen.getByText('toggle-archive-file-sem-titulo'))
      await waitFor(() => expect(archivedFilesText()).toBe(JSON.stringify([key])))
      expect(JSON.parse(localStorage.getItem('archivedFiles') ?? '[]')).toEqual([key])

      fireEvent.click(screen.getByText('toggle-archive-file-sem-titulo'))
      await waitFor(() => expect(archivedFilesText()).toBe('[]'))
      expect(JSON.parse(localStorage.getItem('archivedFiles') ?? '[]')).toEqual([])
    })

    it('archiving the currently-open file moves the selection to a sibling in the same project', async () => {
      const { container } = renderHarness()
      const stateText = () => container.querySelector('pre')?.textContent ?? ''

      fireEvent.click(screen.getByText('create-file')) // Meu Projeto/notes
      fireEvent.click(screen.getByText('select-sem-titulo')) // re-select the seeded file
      await waitFor(() => expect(stateText()).toContain('"currentFile":"Sem título"'))

      fireEvent.click(screen.getByText('toggle-archive-file-sem-titulo'))

      await waitFor(() => {
        expect(stateText()).toContain('"currentProject":"Meu Projeto"')
        expect(stateText()).toContain('"currentFile":"notes"')
      })
    })

    it('archiving the currently-open file falls back to another project when no sibling remains', async () => {
      const { container } = renderHarness()
      const stateText = () => container.querySelector('pre')?.textContent ?? ''

      fireEvent.click(screen.getByText('create-project')) // Segundo (also selects it)
      fireEvent.click(screen.getByText('create-file-segundo')) // Segundo/notes
      fireEvent.click(screen.getByText('select-sem-titulo')) // Meu Projeto/Sem título — its only file
      await waitFor(() => expect(stateText()).toContain('"currentProject":"Meu Projeto"'))

      fireEvent.click(screen.getByText('toggle-archive-file-sem-titulo'))

      await waitFor(() => {
        expect(stateText()).toContain('"currentProject":"Segundo"')
        expect(stateText()).toContain('"currentFile":"notes"')
      })
    })

    it('renaming an archived file carries the archived flag to the new name', async () => {
      const { container } = renderHarness()
      const archivedFilesText = () => container.querySelector('#archivedFiles')?.textContent ?? ''

      fireEvent.click(screen.getByText('create-file')) // Meu Projeto/notes
      fireEvent.click(screen.getByText('toggle-archive-file-notes'))
      await waitFor(() =>
        expect(archivedFilesText()).toBe(
          JSON.stringify([encodeArchivedFileKey('Meu Projeto', 'notes')]),
        ),
      )

      fireEvent.click(screen.getByText('rename-file-notes')) // notes -> notas
      await waitFor(() =>
        expect(archivedFilesText()).toBe(
          JSON.stringify([encodeArchivedFileKey('Meu Projeto', 'notas')]),
        ),
      )
    })

    it('deleting an archived file drops it from the archived set', async () => {
      const { container } = renderHarness()
      const archivedFilesText = () => container.querySelector('#archivedFiles')?.textContent ?? ''

      fireEvent.click(screen.getByText('create-file')) // Meu Projeto/notes
      fireEvent.click(screen.getByText('toggle-archive-file-notes'))
      await waitFor(() =>
        expect(archivedFilesText()).toBe(
          JSON.stringify([encodeArchivedFileKey('Meu Projeto', 'notes')]),
        ),
      )

      fireEvent.click(screen.getByText('delete-file-notes'))
      await waitFor(() => expect(archivedFilesText()).toBe('[]'))
    })

    it('moving an archived file across projects rekeys it to the new project', async () => {
      const { container } = renderHarness()
      const archivedFilesText = () => container.querySelector('#archivedFiles')?.textContent ?? ''

      fireEvent.click(screen.getByText('create-file')) // Meu Projeto/notes
      fireEvent.click(screen.getByText('toggle-archive-file-notes'))
      await waitFor(() =>
        expect(archivedFilesText()).toBe(
          JSON.stringify([encodeArchivedFileKey('Meu Projeto', 'notes')]),
        ),
      )

      fireEvent.click(screen.getByText('create-project')) // Segundo
      fireEvent.click(screen.getByText('move-file')) // Meu Projeto/notes -> Segundo

      await waitFor(() =>
        expect(archivedFilesText()).toBe(
          JSON.stringify([encodeArchivedFileKey('Segundo', 'notes')]),
        ),
      )
    })

    it('renaming a project cascades the rename to its archived files', async () => {
      const { container } = renderHarness()
      const archivedFilesText = () => container.querySelector('#archivedFiles')?.textContent ?? ''

      fireEvent.click(screen.getByText('create-file')) // Meu Projeto/notes
      fireEvent.click(screen.getByText('toggle-archive-file-notes'))
      await waitFor(() =>
        expect(archivedFilesText()).toBe(
          JSON.stringify([encodeArchivedFileKey('Meu Projeto', 'notes')]),
        ),
      )

      fireEvent.click(screen.getByText('rename-meu-projeto')) // Meu Projeto -> Renomeado
      await waitFor(() =>
        expect(archivedFilesText()).toBe(
          JSON.stringify([encodeArchivedFileKey('Renomeado', 'notes')]),
        ),
      )
    })

    it('deleting a project drops its archived files from the set', async () => {
      const { container } = renderHarness()
      const archivedFilesText = () => container.querySelector('#archivedFiles')?.textContent ?? ''

      fireEvent.click(screen.getByText('create-file')) // Meu Projeto/notes
      fireEvent.click(screen.getByText('toggle-archive-file-notes'))
      await waitFor(() =>
        expect(archivedFilesText()).toBe(
          JSON.stringify([encodeArchivedFileKey('Meu Projeto', 'notes')]),
        ),
      )

      fireEvent.click(screen.getByText('delete-meu-projeto'))
      await waitFor(() => expect(archivedFilesText()).toBe('[]'))
    })

    // A last-edited pointer into a file the user has since individually
    // archived must not reopen the very thing they hid.
    it('boot selection skips a last-edited file that is individually archived', async () => {
      localStorage.setItem(
        'projects',
        JSON.stringify({
          schemaVersion: 1,
          projects: {
            A: {
              one: { name: 'one', content: '', size: 0, timestamp: 't' },
              two: { name: 'two', content: '', size: 0, timestamp: 't' },
            },
          },
        }),
      )
      localStorage.setItem('lastEditedFile', JSON.stringify({ project: 'A', file: 'one' }))
      localStorage.setItem('archivedFiles', JSON.stringify([encodeArchivedFileKey('A', 'one')]))

      const { container } = renderHarness()
      const stateText = () => container.querySelector('pre')?.textContent ?? ''

      await waitFor(() => {
        expect(stateText()).toContain('"currentProject":"A"')
        expect(stateText()).toContain('"currentFile":"two"')
      })
    })
  })
})
