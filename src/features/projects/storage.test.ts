import { beforeEach, describe, expect, it } from 'vitest'
import {
  backupProjects,
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
