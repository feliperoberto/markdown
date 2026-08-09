import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { useProjects } from './useProjects'
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

let fakeRemote: { projects: ProjectsState; tombstones: Record<string, string> } = {
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
    reconcileWithRemote,
  } = useProjects()

  function sync() {
    const result = reconcileWithRemote(fakeRemote.projects, fakeRemote.tombstones)
    fakeRemote = { projects: result.projects, tombstones: result.tombstones }
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
      <button onClick={sync}>sync</button>
      <pre>{JSON.stringify(projects)}</pre>
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
