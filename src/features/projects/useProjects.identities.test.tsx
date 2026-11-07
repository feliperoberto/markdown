import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { useProjects } from './useProjects'

// Stable ids for projects and files (openspec change add-sync-item-identity):
// the hook keeps the identity sidecar in step with create / rename / delete /
// import. Cross-device behavior is covered in sync-roundtrip.test.tsx.

function Harness() {
  const {
    identities,
    createProject,
    createFile,
    createFiles,
    renameProject,
    renameFile,
    deleteFile,
    deleteProject,
    importProjects,
    toggleProjectArchived,
    archivedProjects,
  } = useProjects()

  return (
    <div>
      <button onClick={() => createProject('P')}>create-project</button>
      <button onClick={() => createFile('P', 'old', 'hello')}>create-file</button>
      <button onClick={() => createFiles('P', [{ name: 'b1', content: '1' }])}>create-batch</button>
      <button onClick={() => renameProject('P', 'P2')}>rename-project</button>
      <button onClick={() => renameFile('P', 'old', 'new')}>rename-file</button>
      <button onClick={() => deleteFile('P', 'old')}>delete-file</button>
      <button onClick={() => deleteProject('P')}>delete-project</button>
      <button onClick={() => toggleProjectArchived('P')}>archive-project</button>
      <button onClick={() => importProjects({ Imported: { 'x.md': stamp('x.md') } })}>
        import
      </button>
      <pre data-testid="ids">{JSON.stringify(identities)}</pre>
      <pre data-testid="archived">{JSON.stringify([...archivedProjects])}</pre>
    </div>
  )
}

function stamp(name: string) {
  return { name, content: 'c', size: 1, timestamp: new Date().toISOString() }
}

type Ids = {
  projects: Record<string, { name: string; nameUpdatedAt: string }>
  files: Record<string, { projectId: string; name: string }>
}

function readIds(): Ids {
  return JSON.parse(screen.getByTestId('ids').textContent ?? '{}') as Ids
}

function idOf(entries: Record<string, { name: string }>, name: string): string | undefined {
  return Object.entries(entries).find(([, v]) => v.name === name)?.[0]
}

function renderHarness() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  )
}

describe('useProjects — stable identities', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    cleanup()
  })

  it('assigns ids to created projects and files, and to the seeded default', async () => {
    renderHarness()
    fireEvent.click(screen.getByText('create-project'))
    fireEvent.click(screen.getByText('create-file'))
    await waitFor(() => expect(idOf(readIds().files, 'old')).toBeDefined())

    const ids = readIds()
    expect(idOf(ids.projects, 'P')).toBeDefined()
    expect(Object.keys(ids.projects).length).toBeGreaterThanOrEqual(2) // seeded default + P
    expect(JSON.parse(localStorage.getItem('identities') ?? '{}').projects).toBeDefined()
  })

  it('assigns ids to batch-created and imported items', async () => {
    renderHarness()
    fireEvent.click(screen.getByText('create-project'))
    fireEvent.click(screen.getByText('create-batch'))
    fireEvent.click(screen.getByText('import'))
    await waitFor(() => expect(idOf(readIds().files, 'b1')).toBeDefined())
    await waitFor(() => expect(idOf(readIds().projects, 'Imported')).toBeDefined())
    expect(idOf(readIds().files, 'x.md')).toBeDefined()
  })

  it('keeps the id on a project rename, still records the tombstone and carries the archived flag', async () => {
    renderHarness()
    fireEvent.click(screen.getByText('create-project'))
    fireEvent.click(screen.getByText('create-file'))
    await waitFor(() => expect(idOf(readIds().files, 'old')).toBeDefined())
    fireEvent.click(screen.getByText('archive-project'))
    const before = readIds()
    const projectId = idOf(before.projects, 'P')
    const fileId = idOf(before.files, 'old')

    fireEvent.click(screen.getByText('rename-project'))

    await waitFor(() => expect(idOf(readIds().projects, 'P2')).toBe(projectId))
    const after = readIds()
    expect(idOf(after.projects, 'P')).toBeUndefined()
    expect(idOf(after.files, 'old')).toBe(fileId)
    expect(after.files[fileId as string]?.projectId).toBe(projectId)
    expect(screen.getByTestId('archived').textContent).toContain('P2')
    const tombstones = Object.keys(JSON.parse(localStorage.getItem('tombstones') ?? '{}'))
    expect(tombstones.length).toBeGreaterThan(0)
  })

  it('keeps the id on a file rename and updates its rename time', async () => {
    renderHarness()
    fireEvent.click(screen.getByText('create-project'))
    fireEvent.click(screen.getByText('create-file'))
    await waitFor(() => expect(idOf(readIds().files, 'old')).toBeDefined())
    const fileId = idOf(readIds().files, 'old')

    fireEvent.click(screen.getByText('rename-file'))

    await waitFor(() => expect(idOf(readIds().files, 'new')).toBe(fileId))
    expect(idOf(readIds().files, 'old')).toBeUndefined()
  })

  it('drops the entries of deleted files and projects', async () => {
    renderHarness()
    fireEvent.click(screen.getByText('create-project'))
    fireEvent.click(screen.getByText('create-file'))
    await waitFor(() => expect(idOf(readIds().files, 'old')).toBeDefined())

    fireEvent.click(screen.getByText('delete-file'))
    await waitFor(() => expect(idOf(readIds().files, 'old')).toBeUndefined())
    expect(idOf(readIds().projects, 'P')).toBeDefined()

    fireEvent.click(screen.getByText('delete-project'))
    await waitFor(() => expect(idOf(readIds().projects, 'P')).toBeUndefined())
  })
})
