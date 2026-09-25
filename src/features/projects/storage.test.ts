import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  backupProjects,
  configureProjectsStorage,
  LEGACY_MAX_BACKUPS,
  LOCAL_STORAGE_MAX_BACKUPS,
  loadArchivedFiles,
  loadArchivedProjects,
  loadCollapsedProjects,
  loadLastEditedFile,
  loadProjects,
  saveArchivedFiles,
  saveArchivedProjects,
  saveCollapsedProjects,
  saveLastEditedFile,
  saveProjects,
  pruneExcessBackups,
  resetProjectsStorage,
} from './storage'
import { localStorageAdapter } from '@/lib/storage-adapter'
import type { StorageAdapter } from '@/lib/storage-adapter'
import { CURRENT_SCHEMA_VERSION } from '@/lib/storage-migrations'

describe('loadProjects — first-run seeding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // Regression test: first-run seeding was dropped in the migration —
  // loadProjects() returned {} on empty storage, leaving a brand-new user
  // on an empty sidebar with no obvious next action. The prototype seeded
  // a starter project + file on first load.
  it('seeds a default project + file when nothing is stored', () => {
    const result = loadProjects()

    expect(Object.keys(result)).toEqual(['Meu Projeto'])
    expect(Object.keys(result['Meu Projeto'] ?? {})).toEqual(['Sem título'])
    expect(result['Meu Projeto']?.['Sem título']?.content).toBe('')
  })

  it('persists the seed immediately so a reload does not seed a second one', () => {
    const first = loadProjects()
    const second = loadProjects()

    expect(second['Meu Projeto']?.['Sem título']?.timestamp).toBe(
      first['Meu Projeto']?.['Sem título']?.timestamp,
    )
  })

  it('does not re-seed when the user has already stored (and emptied) their projects', () => {
    saveProjects({})

    const result = loadProjects()

    expect(result).toEqual({})
  })

  it('does not re-seed when real stored data exists', () => {
    saveProjects({
      'My Project': { notes: { name: 'notes', content: 'hi', size: 2, timestamp: 't' } },
    })

    const result = loadProjects()

    expect(Object.keys(result)).toEqual(['My Project'])
  })
})

describe('last-edited-file memory (issue #92)', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a saved selection', () => {
    saveLastEditedFile({ project: 'P', file: 'notes' })
    expect(loadLastEditedFile()).toEqual({ project: 'P', file: 'notes' })
  })

  it('returns null when nothing is stored', () => {
    expect(loadLastEditedFile()).toBeNull()
  })

  it('clears the pointer when saved with null', () => {
    saveLastEditedFile({ project: 'P', file: 'notes' })
    saveLastEditedFile(null)
    expect(loadLastEditedFile()).toBeNull()
  })

  it('ignores a malformed stored value', () => {
    localStorage.setItem('lastEditedFile', '{"project":123}')
    expect(loadLastEditedFile()).toBeNull()
    localStorage.setItem('lastEditedFile', 'not json')
    expect(loadLastEditedFile()).toBeNull()
  })
})

describe('collapsed-projects memory (issue #92)', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a saved set of names', () => {
    saveCollapsedProjects(new Set(['A', 'B']))
    expect([...loadCollapsedProjects()].sort()).toEqual(['A', 'B'])
  })

  it('returns an empty set when nothing is stored (all expanded)', () => {
    expect(loadCollapsedProjects().size).toBe(0)
  })

  it('ignores non-string entries and malformed values', () => {
    localStorage.setItem('collapsedProjects', '["A", 1, null, "B"]')
    expect([...loadCollapsedProjects()].sort()).toEqual(['A', 'B'])
    localStorage.setItem('collapsedProjects', '{"not":"an array"}')
    expect(loadCollapsedProjects().size).toBe(0)
  })
})

describe('archived-projects memory', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a saved set of names', () => {
    saveArchivedProjects(new Set(['A', 'B']))
    expect([...loadArchivedProjects()].sort()).toEqual(['A', 'B'])
  })

  it('returns an empty set when nothing is stored (nothing archived)', () => {
    expect(loadArchivedProjects().size).toBe(0)
  })

  it('ignores non-string entries and malformed values', () => {
    localStorage.setItem('archivedProjects', '["A", 1, null, "B"]')
    expect([...loadArchivedProjects()].sort()).toEqual(['A', 'B'])
    localStorage.setItem('archivedProjects', '{"not":"an array"}')
    expect(loadArchivedProjects().size).toBe(0)
  })

  it('does not throw when the adapter fails to save', () => {
    const throwingAdapter: StorageAdapter = {
      get: () => null,
      set: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
      remove: () => {},
    }
    expect(() => saveArchivedProjects(new Set(['A']), throwingAdapter)).not.toThrow()
  })
})

describe('archived-files memory', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a saved set of composite keys', () => {
    saveArchivedFiles(new Set(['["A","a"]', '["B","b"]']))
    expect([...loadArchivedFiles()].sort()).toEqual(['["A","a"]', '["B","b"]'])
  })

  it('returns an empty set when nothing is stored (nothing archived)', () => {
    expect(loadArchivedFiles().size).toBe(0)
  })

  it('ignores non-string entries and malformed values', () => {
    localStorage.setItem('archivedFiles', JSON.stringify(['["A","a"]', 1, null, '["B","b"]']))
    expect([...loadArchivedFiles()].sort()).toEqual(['["A","a"]', '["B","b"]'])
    localStorage.setItem('archivedFiles', '{"not":"an array"}')
    expect(loadArchivedFiles().size).toBe(0)
  })

  it('does not throw when the adapter fails to save', () => {
    const throwingAdapter: StorageAdapter = {
      get: () => null,
      set: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
      remove: () => {},
    }
    expect(() => saveArchivedFiles(new Set(['["A","a"]']), throwingAdapter)).not.toThrow()
  })
})

describe('saveProjects — write failure propagation', () => {
  // Regression test: saveProjects/writeEnvelope had no quota handling, so
  // a QuotaExceededError propagated as an uncaught throw. This test
  // documents that the failure IS thrown (not silently swallowed) —
  // useProjects.persist is responsible for catching it and surfacing a
  // toast (see useProjects.ts).
  it('propagates a write failure from the underlying adapter', () => {
    const throwingAdapter: StorageAdapter = {
      get: () => null,
      set: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
      remove: () => {},
    }

    expect(() => saveProjects({}, throwingAdapter)).toThrow('quota')
  })

  it('succeeds against the real localStorage adapter', () => {
    localStorage.clear()

    expect(() =>
      saveProjects(
        { P: { f: { name: 'f', content: 'x', size: 1, timestamp: 't' } } },
        localStorageAdapter,
      ),
    ).not.toThrow()
  })
})

describe('future-schema handling (ADR-0003: an old tab reading/writing after a newer tab updated)', () => {
  beforeEach(() => localStorage.clear())

  it('reads a future-schema envelope as-is, without migrating or re-persisting it', () => {
    const future = {
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      projects: { P: { f: { name: 'f', content: 'from the future', size: 1, timestamp: 't' } } },
    }
    localStorage.setItem('projects', JSON.stringify(future))

    const result = loadProjects()

    expect(result).toEqual(future.projects)
    // Untouched: still the exact envelope this tab found, not silently
    // downgraded or rewritten.
    expect(JSON.parse(localStorage.getItem('projects') ?? '')).toEqual(future)
  })

  it('stamps its own CURRENT_SCHEMA_VERSION when saving after reading future-schema data, rather than preserving the higher number', () => {
    // Deliberate down-stamp, not a bug: this build cannot promise the
    // data it just wrote is still shaped like the newer version it found
    // on disk, so claiming otherwise would let a future build skip a
    // migration it actually still needs to run (see the INVARIANT note in
    // storage-migrations.ts). The next newer-build load simply re-runs
    // that migration — safe, because migrations are required to be
    // purely additive.
    const future = { schemaVersion: CURRENT_SCHEMA_VERSION + 1, projects: { P: {} } }
    localStorage.setItem('projects', JSON.stringify(future))
    loadProjects() // as a real caller would, before editing

    saveProjects({ P: {}, Q: {} })

    const stored = JSON.parse(localStorage.getItem('projects') ?? '')
    expect(stored.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(stored.projects).toEqual({ P: {}, Q: {} })
  })

  it('stamps its own CURRENT_SCHEMA_VERSION in a backup snapshot too, even with future-schema data on disk', () => {
    const future = { schemaVersion: CURRENT_SCHEMA_VERSION + 1, projects: { P: {} } }
    localStorage.setItem('projects', JSON.stringify(future))

    backupProjects({ P: {} })

    const backup = JSON.parse(localStorage.getItem('projects_backup_1') ?? '')
    expect(backup.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})

describe('backups — issue #120 (quota exhaustion)', () => {
  const snapshot = (projects: object) =>
    JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projects })

  beforeEach(() => {
    localStorage.clear()
    resetProjectsStorage()
  })
  afterEach(() => resetProjectsStorage())

  it(`caps localStorage backups at ${LOCAL_STORAGE_MAX_BACKUPS}, newest first`, () => {
    for (let index = 1; index <= 5; index++) backupProjects({ [`P${index}`]: {} })

    expect(localStorage.getItem('projects_backup_1')).toBe(snapshot({ P5: {} }))
    expect(localStorage.getItem('projects_backup_3')).toBe(snapshot({ P3: {} }))
    expect(localStorage.getItem('projects_backup_4')).toBeNull()
  })

  it('skips a backup identical to the newest one', () => {
    backupProjects({ A: {} })
    backupProjects({ B: {} })
    backupProjects({ B: {} })

    expect(localStorage.getItem('projects_backup_1')).toBe(snapshot({ B: {} }))
    expect(localStorage.getItem('projects_backup_2')).toBe(snapshot({ A: {} }))
    expect(localStorage.getItem('projects_backup_3')).toBeNull()
  })

  it('still backs up a content-only change (same names, different content)', () => {
    const file = (content: string) => ({ name: 'f', content, size: 1, timestamp: 't' })
    backupProjects({ P: { f: file('before import') } })
    backupProjects({ P: { f: file('after import') } })

    expect(localStorage.getItem('projects_backup_2')).not.toBeNull()
  })

  it(`pruneExcessBackups removes orphaned slots up to ${LEGACY_MAX_BACKUPS}`, () => {
    for (let index = 1; index <= LEGACY_MAX_BACKUPS; index++) {
      localStorage.setItem(`projects_backup_${index}`, `v${index}`)
    }

    pruneExcessBackups()

    expect(localStorage.getItem('projects_backup_3')).toBe('v3')
    expect(localStorage.getItem('projects_backup_4')).toBeNull()
    expect(localStorage.getItem(`projects_backup_${LEGACY_MAX_BACKUPS}`)).toBeNull()
  })

  it('uses the configured adapter and cap', () => {
    const values = new Map<string, string>()
    const adapter: StorageAdapter = {
      get: (key) => values.get(key) ?? null,
      set: (key, value) => void values.set(key, value),
      remove: (key) => void values.delete(key),
    }
    configureProjectsStorage(adapter, { maxBackups: 5 })

    for (let index = 1; index <= 6; index++) backupProjects({ [`P${index}`]: {} })
    saveProjects({ X: {} })

    expect(values.get('projects_backup_5')).toBe(snapshot({ P2: {} }))
    expect(values.has('projects_backup_6')).toBe(false)
    expect(loadProjects()).toEqual({ X: {} })
    expect(localStorage.length).toBe(0)
  })
})

describe('saveProjects — quota recovery by evicting backups (issue #120)', () => {
  // Adapter with a character budget, modelling localStorage's quota.
  function budgetAdapter(budget: number) {
    const values = new Map<string, string>()
    const used = () => Array.from(values.values()).reduce((sum, value) => sum + value.length, 0)
    const adapter: StorageAdapter = {
      get: (key) => values.get(key) ?? null,
      set: (key, value) => {
        const previous = values.get(key)?.length ?? 0
        if (used() - previous + value.length > budget) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        }
        values.set(key, value)
      },
      remove: (key) => void values.delete(key),
    }
    return { adapter, values }
  }

  it('evicts the oldest backups until the primary blob fits', () => {
    const { adapter, values } = budgetAdapter(1000)
    values.set('projects_backup_1', 'x'.repeat(300))
    values.set('projects_backup_2', 'x'.repeat(300))
    values.set('projects_backup_3', 'x'.repeat(300))
    const big = { P: { f: { name: 'f', content: 'y'.repeat(250), size: 250, timestamp: 't' } } }

    saveProjects(big, adapter)

    expect(values.has('projects_backup_3')).toBe(false)
    expect(values.has('projects_backup_1')).toBe(true)
    expect(JSON.parse(values.get('projects') ?? '').projects).toEqual(big)
  })

  it('rethrows the quota error when no amount of eviction makes it fit', () => {
    const { adapter, values } = budgetAdapter(50)
    values.set('projects_backup_1', 'x'.repeat(10))
    const big = { P: { f: { name: 'f', content: 'y'.repeat(100), size: 100, timestamp: 't' } } }

    expect(() => saveProjects(big, adapter)).toThrow('quota')
    expect(values.has('projects')).toBe(false)
  })

  it('never evicts on a non-quota error', () => {
    const values = new Map([['projects_backup_1', 'keep']])
    const adapter: StorageAdapter = {
      get: (key) => values.get(key) ?? null,
      set: () => {
        throw new Error('boom')
      },
      remove: (key) => void values.delete(key),
    }

    expect(() => saveProjects({}, adapter)).toThrow('boom')
    expect(values.get('projects_backup_1')).toBe('keep')
  })
})
