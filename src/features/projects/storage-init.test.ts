import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openIndexedDbStore, type AsyncKeyValueStore } from '@/lib/idb-kv'
import { CURRENT_SCHEMA_VERSION } from '@/lib/storage-migrations'
import {
  getProjectsAdapter,
  INDEXED_DB_MAX_BACKUPS,
  loadProjects,
  resetProjectsStorage,
  saveProjects,
} from './storage'
import {
  getProjectsStorageBackend,
  initProjectsStorage,
  onProjectsWriteError,
} from './storage-init'
import type { ProjectsState } from './types'

const file = (content: string, timestamp = '2026-01-01T00:00:00.000Z') => ({
  name: 'f',
  content,
  size: content.length,
  timestamp,
})
const blob = (projects: ProjectsState) =>
  JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projects })

let factory: IDBFactory
const openStore = () =>
  openIndexedDbStore({ dbName: 'markdown', storeName: 'kv', timeoutMs: 1000, factory })
const unavailable = () => Promise.reject(new Error('no IndexedDB'))

async function idbContents(): Promise<Map<string, string>> {
  return (await openStore()).getAll()
}

async function settle(): Promise<void> {
  const adapter = getProjectsAdapter() as { flush?: () => Promise<void> }
  await adapter.flush?.()
}

describe('initProjectsStorage (issue #120)', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    localStorage.clear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    resetProjectsStorage()
    vi.restoreAllMocks()
  })

  it('uses IndexedDB on a first-ever run and seeds the default project there', async () => {
    expect(await initProjectsStorage({ openStore })).toBe('indexeddb')
    expect(getProjectsStorageBackend()).toBe('indexeddb')

    const seeded = loadProjects()
    await settle()

    expect(Object.keys(seeded)).toEqual(['Meu Projeto'])
    expect(localStorage.getItem('projects')).toBeNull()
    expect(localStorage.getItem('projectsBackend')).toBe('indexeddb')
    expect(JSON.parse((await idbContents()).get('projects') ?? '').projects).toEqual(seeded)
  })

  it('moves the localStorage blob and newest backups into IndexedDB, then frees localStorage', async () => {
    const projects = { P: { f: file('mine') } }
    localStorage.setItem('projects', blob(projects))
    for (let index = 1; index <= 50; index++) {
      localStorage.setItem(`projects_backup_${index}`, `backup-${index}`)
    }
    localStorage.setItem('theme', 'dark')

    await initProjectsStorage({ openStore })

    expect(loadProjects()).toEqual(projects)
    const stored = await idbContents()
    expect(stored.get('projects_backup_1')).toBe('backup-1')
    expect(stored.get(`projects_backup_${INDEXED_DB_MAX_BACKUPS}`)).toBe(
      `backup-${INDEXED_DB_MAX_BACKUPS}`,
    )
    expect(stored.has(`projects_backup_${INDEXED_DB_MAX_BACKUPS + 1}`)).toBe(false)
    expect(localStorage.getItem('projects')).toBeNull()
    expect(localStorage.getItem('projects_backup_1')).toBeNull()
    expect(localStorage.getItem('projects_backup_50')).toBeNull()
    // Unrelated keys are untouched.
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('compacts sparse legacy backup slots, keeping newest-first order', async () => {
    localStorage.setItem('projects', blob({}))
    localStorage.setItem('projects_backup_2', 'second')
    localStorage.setItem('projects_backup_7', 'seventh')

    await initProjectsStorage({ openStore })

    const stored = await idbContents()
    expect(stored.get('projects_backup_1')).toBe('second')
    expect(stored.get('projects_backup_2')).toBe('seventh')
  })

  it('persists later saves to IndexedDB across a reload', async () => {
    await initProjectsStorage({ openStore })
    saveProjects({ Saved: {} })
    await settle()
    resetProjectsStorage()

    await initProjectsStorage({ openStore })

    expect(loadProjects()).toEqual({ Saved: {} })
  })

  it('keeps localStorage (and prunes orphaned backups) when IndexedDB is unavailable', async () => {
    localStorage.setItem('projects', blob({ P: {} }))
    localStorage.setItem('projects_backup_1', 'b1')
    localStorage.setItem('projects_backup_40', 'b40')

    expect(await initProjectsStorage({ openStore: unavailable })).toBe('localstorage')

    expect(loadProjects()).toEqual({ P: {} })
    expect(localStorage.getItem('projects_backup_1')).toBe('b1')
    expect(localStorage.getItem('projects_backup_40')).toBeNull()
  })

  it('keeps localStorage untouched when the import transaction fails', async () => {
    localStorage.setItem('projects', blob({ P: {} }))
    const failingWrites: () => Promise<AsyncKeyValueStore> = async () => ({
      getAll: async () => new Map(),
      write: () => Promise.reject(new Error('quota')),
    })

    expect(await initProjectsStorage({ openStore: failingWrites })).toBe('localstorage')

    expect(localStorage.getItem('projects')).toBe(blob({ P: {} }))
    expect(localStorage.getItem('projectsBackend')).toBeNull()
  })

  it('runs in memory, without touching localStorage, when IndexedDB held the data but cannot open', async () => {
    localStorage.setItem('projectsBackend', 'indexeddb')

    expect(await initProjectsStorage({ openStore: unavailable })).toBe('memory')

    loadProjects() // seeds — must not land anywhere durable
    saveProjects({ Edited: {} })
    expect(localStorage.getItem('projects')).toBeNull()
  })

  it('merges a blob a pre-IndexedDB tab wrote after migration, newest file wins', async () => {
    await initProjectsStorage({ openStore })
    saveProjects({
      Shared: { f: file('idb (older)', '2026-01-01T00:00:00.000Z') },
      IdbOnly: {},
    })
    await settle()
    resetProjectsStorage()
    // A stale tab keeps saving to localStorage as it always did.
    localStorage.setItem(
      'projects',
      blob({
        Shared: { f: file('stale tab (newer)', '2026-02-01T00:00:00.000Z') },
        StaleOnly: {},
      }),
    )

    await initProjectsStorage({ openStore })
    await settle()

    const merged = loadProjects()
    expect(merged.Shared?.f?.content).toBe('stale tab (newer)')
    expect(Object.keys(merged).sort()).toEqual(['IdbOnly', 'Shared', 'StaleOnly'])
    expect(localStorage.getItem('projects')).toBeNull()
    // The pre-merge IndexedDB state is kept as a backup.
    const backup = JSON.parse((await idbContents()).get('projects_backup_1') ?? '')
    expect(backup.projects.Shared.f.content).toBe('idb (older)')
  })

  it('does not seed over data a concurrent tab migrated between reads (code review)', async () => {
    const projects = { Mine: { f: file('real data') } }
    localStorage.setItem('projects', blob(projects))
    // Simulates tab A finishing its migration right after this tab's
    // IndexedDB read: commit to IndexedDB, then drop the localStorage copy.
    const racingStore = async (): Promise<AsyncKeyValueStore> => {
      const real = await openStore()
      return {
        getAll: async () => {
          const snapshot = await real.getAll()
          await real.write([['projects', blob(projects)]])
          localStorage.removeItem('projects')
          return snapshot
        },
        write: (entries) => real.write(entries),
      }
    }

    await initProjectsStorage({ openStore: racingStore })
    const loaded = loadProjects()
    await settle()

    expect(loaded).toEqual(projects)
    expect(JSON.parse((await idbContents()).get('projects') ?? '').projects).toEqual(projects)
  })

  it('falls back when the initial IndexedDB read hangs (code review)', async () => {
    vi.useFakeTimers()
    try {
      const hanging = async (): Promise<AsyncKeyValueStore> => ({
        getAll: () => new Promise(() => {}),
        write: async () => {},
      })
      const result = initProjectsStorage({ openStore: hanging })
      await vi.advanceTimersByTimeAsync(5000)

      expect(await result).toBe('localstorage')
    } finally {
      vi.useRealTimers()
    }
  })

  it('evicts the oldest backups and retries when an IndexedDB write hits the quota (code review)', async () => {
    const budget = 1100
    const stored = new Map<string, string>([
      ['projects', blob({})],
      ['projects_backup_1', 'a'.repeat(300)],
      ['projects_backup_2', 'b'.repeat(300)],
      ['projects_backup_3', 'c'.repeat(300)],
    ])
    const quotaStore = async (): Promise<AsyncKeyValueStore> => ({
      getAll: async () => new Map(stored),
      write: async (entries) => {
        const next = new Map(stored)
        for (const [key, value] of entries) {
          if (value === null) next.delete(key)
          else next.set(key, value)
        }
        const size = Array.from(next.values()).reduce((sum, value) => sum + value.length, 0)
        if (size > budget) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        }
        stored.clear()
        for (const [key, value] of next) stored.set(key, value)
      },
    })
    const reported = vi.fn()
    const unsubscribe = onProjectsWriteError(reported)
    await initProjectsStorage({ openStore: quotaStore })

    const big = { P: { f: file('x'.repeat(380)) } }
    saveProjects(big)

    await vi.waitFor(() => expect(stored.get('projects')).toBe(blob(big)))
    expect(stored.has('projects_backup_3')).toBe(false)
    expect(stored.has('projects_backup_1')).toBe(true)
    expect(reported).not.toHaveBeenCalled()
    unsubscribe()
  })
})
