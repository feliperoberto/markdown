import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { useProjects } from './useProjects'
import type { Identities } from './identities'
import type { ProjectsState } from './types'

// Regression coverage for the reported bug: a renamed or deleted file
// reappearing as a duplicate after a Drive sync.
// `model.test.ts` covers `mergeProjectsByFreshness` as a pure function
// (hand-built local/remote pairs) and `useProjects.test.tsx` covers
// `reconcileWithRemote` as a single call — neither models the actual
// *sequence* that produces the bug: push (remote now has the old key) ->
// rename/delete (a key move; the old key survives remotely) -> pull +
// reconcile (the old key comes back from remote) -> push (permanently, on
// both sides). This file drives that full sequence through the real
// `useProjects` hook, simulating "Drive" as a single shared in-memory
// snapshot that a `sync` action pulls from and pushes back to — exactly
// what `reconcileWithRemote`'s return value is for (see its doc comment:
// "so the caller can push it straight back without a second round-trip"),
// collapsed into one call since there's no real Drive provider here.
//
// Deliberately single continuous session (one `useProjects` instance),
// matching the literal reported scenario and the fix's own doc comment on
// `mergeProjectsByFreshness` ("push -> rename -> pull -> merge -> push").
// The cross-device case — a tombstone recorded on one device suppressing a
// stale entry pulled from another — is a property of `mergeTombstones`
// (latest `deletedAt` wins) and is covered at the pure-function level in
// `tombstones.test.ts`; reproducing two genuinely independent devices here
// would need an injectable storage adapter `useProjects` doesn't expose.

let fakeRemote: {
  projects: ProjectsState
  tombstones: Record<string, string>
  identities?: Identities
} = {
  projects: {},
  tombstones: {},
}

function Harness() {
  const {
    projects,
    createProject,
    deleteProject,
    renameProject,
    createFile,
    renameFile,
    deleteFile,
    updateFileContent,
    toggleProjectArchived,
    archivedProjects,
    identities,
    reconcileWithRemote,
  } = useProjects()

  function sync() {
    const result = reconcileWithRemote(
      fakeRemote.projects,
      fakeRemote.tombstones,
      fakeRemote.identities,
    )
    fakeRemote = {
      projects: result.projects,
      tombstones: result.tombstones,
      identities: result.identities,
    }
  }

  return (
    <div>
      <button onClick={() => createProject('P')}>create-project-p</button>
      <button onClick={() => deleteProject('P')}>delete-project-p</button>
      <button onClick={() => renameProject('P', 'P2')}>rename-project-p</button>
      <button onClick={() => createFile('P', 'old', 'hello')}>create-file</button>
      <button onClick={() => renameFile('P', 'old', 'new')}>rename-file</button>
      <button onClick={() => renameFile('P', 'new', 'newer')}>rename-file-again</button>
      <button onClick={() => deleteFile('P', 'old')}>delete-file</button>
      <button onClick={() => updateFileContent('P', 'old', 'local edit')}>edit-old</button>
      <button onClick={() => toggleProjectArchived('P')}>archive-p</button>
      <button onClick={() => toggleProjectArchived('P2')}>archive-p2</button>
      <button onClick={sync}>sync</button>
      <pre>{JSON.stringify(projects)}</pre>
      <pre data-testid="ids">{JSON.stringify(identities)}</pre>
      <pre data-testid="archived">{JSON.stringify([...archivedProjects])}</pre>
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

describe('sync round trip (push -> mutate -> sync)', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeRemote = { projects: {}, tombstones: {} }
  })

  afterEach(() => {
    cleanup()
  })

  it('a rename does not resurrect the old file name after a second sync', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-project-p'))
    fireEvent.click(screen.getByText('create-file')) // P/old
    await waitFor(() => expect(stateText()).toContain('"old"'))

    fireEvent.click(screen.getByText('sync')) // remote now has P/old
    await waitFor(() => expect(fakeRemote.projects.P?.old).toBeDefined())

    fireEvent.click(screen.getByText('rename-file')) // P/old -> P/new
    await waitFor(() => expect(stateText()).toContain('"new"'))

    fireEvent.click(screen.getByText('sync')) // pull (still has old) -> merge -> push

    await waitFor(() => {
      expect(fakeRemote.projects.P?.new).toBeDefined()
      expect(fakeRemote.projects.P?.old).toBeUndefined()
    })
    // Local state must never have resurrected the old name either.
    expect(stateText()).not.toContain('"old"')
  })

  it('a delete does not resurrect the file after a second sync', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-project-p'))
    fireEvent.click(screen.getByText('create-file')) // P/old
    await waitFor(() => expect(stateText()).toContain('"old"'))

    fireEvent.click(screen.getByText('sync')) // remote now has P/old
    await waitFor(() => expect(fakeRemote.projects.P?.old).toBeDefined())

    fireEvent.click(screen.getByText('delete-file'))
    await waitFor(() => expect(stateText()).not.toContain('"old"'))

    fireEvent.click(screen.getByText('sync')) // pull (still has old) -> merge -> push

    await waitFor(() => expect(fakeRemote.projects.P?.old).toBeUndefined())
    expect(stateText()).not.toContain('"old"')
  })

  // Renaming twice (old -> new -> newer), syncing after each, must not
  // leave a THIRD copy behind — the first rename's tombstone (old) and the
  // second's (new) must both still hold after the second sync pulls a
  // remote that only knows about the first rename.
  it('renaming twice across syncs leaves exactly one copy, under the final name', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-project-p'))
    fireEvent.click(screen.getByText('create-file')) // P/old
    await waitFor(() => expect(stateText()).toContain('"old"'))
    fireEvent.click(screen.getByText('sync')) // remote: { old }
    await waitFor(() => expect(fakeRemote.projects.P?.old).toBeDefined())

    fireEvent.click(screen.getByText('rename-file')) // P/old -> P/new
    await waitFor(() => expect(stateText()).toContain('"new"'))
    fireEvent.click(screen.getByText('sync')) // pull { old } -> merge -> push { new }
    await waitFor(() => expect(fakeRemote.projects.P?.new).toBeDefined())
    expect(fakeRemote.projects.P?.old).toBeUndefined()

    fireEvent.click(screen.getByText('rename-file-again')) // P/new -> P/newer
    await waitFor(() => expect(stateText()).toContain('"newer"'))
    fireEvent.click(screen.getByText('sync')) // pull { new } -> merge -> push { newer }
    await waitFor(() => expect(fakeRemote.projects.P?.newer).toBeDefined())

    expect(Object.keys(fakeRemote.projects.P ?? {})).toEqual(['newer'])
  })

  // Regression: deleteProject/renameProject previously recorded only a
  // project-level tombstone, never a per-file one for the files that lived
  // under that name. mergeProjectsByFreshness's whole-project tombstone
  // check only fires while the name is absent locally
  // (`!projectExists(local, projectName)`) — the moment the name exists
  // locally again (recreated, or renamed into), that check is skipped
  // entirely and a missing per-file tombstone let the old files merge
  // straight back in.
  it('reusing a deleted project name does not resurrect its old files after sync', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-project-p'))
    fireEvent.click(screen.getByText('create-file')) // P/old
    await waitFor(() => expect(stateText()).toContain('"old"'))

    fireEvent.click(screen.getByText('sync')) // remote now has P/old
    await waitFor(() => expect(fakeRemote.projects.P?.old).toBeDefined())

    fireEvent.click(screen.getByText('delete-project-p'))
    await waitFor(() => expect(stateText()).not.toContain('"old"'))

    fireEvent.click(screen.getByText('create-project-p')) // a brand-new, empty P
    await waitFor(() => expect(stateText()).toContain('"P"'))

    fireEvent.click(screen.getByText('sync')) // pull (remote still has old P/old) -> merge -> push

    await waitFor(() => expect(fakeRemote.projects.P).toBeDefined())
    expect(Object.keys(fakeRemote.projects.P ?? {})).toEqual([])
    expect(stateText()).not.toContain('"old"')
  })

  it('reusing a project name after renaming it away does not resurrect its old files after sync', async () => {
    const { container } = renderHarness()
    const stateText = () => container.querySelector('pre')?.textContent ?? ''

    fireEvent.click(screen.getByText('create-project-p'))
    fireEvent.click(screen.getByText('create-file')) // P/old
    await waitFor(() => expect(stateText()).toContain('"old"'))

    fireEvent.click(screen.getByText('sync')) // remote now has P/old
    await waitFor(() => expect(fakeRemote.projects.P?.old).toBeDefined())

    fireEvent.click(screen.getByText('rename-project-p')) // P -> P2, old comes with it
    await waitFor(() => expect(stateText()).toContain('"P2"'))

    fireEvent.click(screen.getByText('create-project-p')) // a brand-new, empty P
    await waitFor(() => expect(stateText()).toContain('"P"'))

    fireEvent.click(screen.getByText('sync')) // pull (remote still has old P/old) -> merge -> push

    await waitFor(() => {
      expect(fakeRemote.projects.P).toBeDefined()
      expect(fakeRemote.projects.P2?.old).toBeDefined()
    })
    expect(Object.keys(fakeRemote.projects.P ?? {})).toEqual([])
  })
})

// Cross-device renames (openspec change add-sync-item-identity): another
// device's rename is simulated by editing the shared fake remote the way
// that device's push would have, i.e. same ids, new name, later rename time.
describe('sync round trip — stable identities', () => {
  const FUTURE = '2999-01-01T00:00:00.000Z'
  const PAST = '2000-01-01T00:00:00.000Z'

  beforeEach(() => {
    localStorage.clear()
    fakeRemote = { projects: {}, tombstones: {} }
  })
  afterEach(() => {
    cleanup()
  })

  async function setupSyncedFile() {
    const view = renderHarness()
    const stateText = () => view.container.querySelector('pre')?.textContent ?? ''
    fireEvent.click(screen.getByText('create-project-p'))
    fireEvent.click(screen.getByText('create-file')) // P/old
    await waitFor(() => expect(stateText()).toContain('"old"'))
    fireEvent.click(screen.getByText('sync')) // remote now has P/old and its ids
    await waitFor(() => expect(fakeRemote.identities).toBeDefined())
    return { stateText }
  }

  function renameOnOtherDevice(opts: {
    project?: string
    file?: string
    content: string
    ts: string
  }) {
    const ids = structuredClone(fakeRemote.identities) as Identities & {
      projects: Record<string, { name: string; nameUpdatedAt: string }>
      files: Record<string, { projectId: string; name: string; nameUpdatedAt: string }>
    }
    const projectName = opts.project ?? 'P'
    const projectId = Object.entries(ids.projects).find(([, p]) => p.name === 'P')?.[0] as string
    const fileId = Object.entries(ids.files).find(([, f]) => f.name === 'old')?.[0] as string
    if (opts.project) ids.projects[projectId] = { name: opts.project, nameUpdatedAt: FUTURE }
    const fileName = opts.file ?? 'old'
    if (opts.file) ids.files[fileId] = { projectId, name: opts.file, nameUpdatedAt: FUTURE }
    fakeRemote = {
      projects: {
        [projectName]: {
          [fileName]: {
            name: fileName,
            content: opts.content,
            size: opts.content.length,
            timestamp: opts.ts,
          },
        },
      },
      tombstones: {},
      identities: ids,
    }
  }

  it('a file renamed on another device merges as one file with the newer content', async () => {
    const { stateText } = await setupSyncedFile()
    renameOnOtherDevice({ file: 'new', content: 'remote edit', ts: FUTURE })

    fireEvent.click(screen.getByText('sync'))

    await waitFor(() => expect(Object.keys(fakeRemote.projects.P ?? {})).toEqual(['new']))
    expect(stateText()).toContain('"new"')
    expect(stateText()).not.toContain('"old"')
    expect(stateText()).toContain('remote edit')
  })

  it('an edit on the old name still lands in the renamed file', async () => {
    const { stateText } = await setupSyncedFile()
    fireEvent.click(screen.getByText('edit-old')) // newer than the remote copy below
    await waitFor(() => expect(stateText()).toContain('local edit'))
    renameOnOtherDevice({ file: 'new', content: 'remote edit', ts: PAST })

    fireEvent.click(screen.getByText('sync'))

    await waitFor(() => expect(Object.keys(fakeRemote.projects.P ?? {})).toEqual(['new']))
    expect(stateText()).not.toContain('"old"')
    expect(stateText()).toContain('local edit')
    expect(fakeRemote.projects.P?.new?.content).toBe('local edit')
  })

  it('a project renamed on another device merges as one project and keeps the archived flag', async () => {
    const { stateText } = await setupSyncedFile()
    fireEvent.click(screen.getByText('archive-p'))
    await waitFor(() => expect(screen.getByTestId('archived').textContent).toContain('"P"'))
    renameOnOtherDevice({ project: 'P2', content: 'hello', ts: PAST })

    fireEvent.click(screen.getByText('sync'))

    await waitFor(() => expect(Object.keys(fakeRemote.projects)).toContain('P2'))
    expect(Object.keys(fakeRemote.projects)).not.toContain('P')
    expect(stateText()).toContain('"P2"')
    expect(stateText()).not.toContain('"P":')
    await waitFor(() => expect(screen.getByTestId('archived').textContent).toContain('P2'))
  })

  it('a version 1 backup without identities adopts the local ids and creates no duplicate', async () => {
    await setupSyncedFile()
    const idsBefore = screen.getByTestId('ids').textContent
    fakeRemote = { projects: structuredClone(fakeRemote.projects), tombstones: {} }

    fireEvent.click(screen.getByText('sync'))

    await waitFor(() => expect(fakeRemote.identities).toBeDefined())
    expect(Object.keys(fakeRemote.projects.P ?? {})).toEqual(['old'])
    expect(screen.getByTestId('ids').textContent).toBe(idsBefore)
  })

  it('two devices that created ids independently converge on one id per item', async () => {
    await setupSyncedFile()
    const ids = structuredClone(fakeRemote.identities) as Identities & {
      projects: Record<string, { name: string; nameUpdatedAt: string }>
      files: Record<string, { projectId: string; name: string; nameUpdatedAt: string }>
    }
    // The other device generated ids of its own for the same names ("0" sorts first).
    fakeRemote = {
      ...fakeRemote,
      identities: {
        projects: Object.fromEntries(
          Object.entries(ids.projects).map(([, v], i) => [`0-p${i}`, v]),
        ),
        files: Object.fromEntries(
          Object.entries(ids.files).map(([, v]) => [
            '0-f',
            {
              ...v,
              projectId: `0-p${Object.values(ids.projects).findIndex((p) => p.name === 'P')}`,
            },
          ]),
        ),
      },
    }

    fireEvent.click(screen.getByText('sync'))

    await waitFor(() => {
      const entries = Object.entries(fakeRemote.identities?.files ?? {})
      expect(entries.filter(([, f]) => f.name === 'old').map(([id]) => id)).toEqual(['0-f'])
    })
    const projectEntries = Object.entries(fakeRemote.identities?.projects ?? {})
    expect(projectEntries.filter(([, p]) => p.name === 'P').map(([id]) => id)).toHaveLength(1)
    expect(projectEntries.find(([, p]) => p.name === 'P')?.[0].startsWith('0-p')).toBe(true)
    expect(Object.keys(fakeRemote.projects.P ?? {})).toEqual(['old'])
  })
})
