import { beforeEach, describe, expect, it } from 'vitest'
import { loadProjects, saveProjects } from './storage'
import { localStorageAdapter } from '@/lib/storage-adapter'
import type { StorageAdapter } from '@/lib/storage-adapter'

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
