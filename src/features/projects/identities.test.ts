import { describe, expect, it } from 'vitest'
import {
  NO_IDENTITIES,
  alignRemote,
  ensureIdentities,
  normalizeIdentities,
  pruneIdentities,
  renameFileIdentity,
  renameProjectIdentity,
} from './identities'
import type { Identities } from './identities'
import type { ProjectsState } from './types'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-02-01T00:00:00.000Z'

function counter(prefix = 'id') {
  let n = 0
  return () => `${prefix}-${++n}`
}

function file(name: string, content = '') {
  return { name, content, size: content.length, timestamp: T0 }
}

const STATE: ProjectsState = {
  Notes: { 'a.md': file('a.md'), 'b.md': file('b.md') },
  Empty: {},
}

describe('ensureIdentities', () => {
  it('assigns unique ids to unknown projects and files', () => {
    const ids = ensureIdentities(NO_IDENTITIES, STATE, T0, counter())

    expect(
      Object.values(ids.projects)
        .map((p) => p.name)
        .sort(),
    ).toEqual(['Empty', 'Notes'])
    expect(
      Object.values(ids.files)
        .map((f) => f.name)
        .sort(),
    ).toEqual(['a.md', 'b.md'])
    expect(new Set([...Object.keys(ids.projects), ...Object.keys(ids.files)]).size).toBe(4)
    const notesId = Object.entries(ids.projects).find(([, p]) => p.name === 'Notes')![0]
    expect(Object.values(ids.files).every((f) => f.projectId === notesId)).toBe(true)
    expect(Object.values(ids.projects).every((p) => p.nameUpdatedAt === T0)).toBe(true)
  })

  it('keeps known ids and returns the same reference when nothing is missing', () => {
    const first = ensureIdentities(NO_IDENTITIES, STATE, T0, counter())
    const second = ensureIdentities(first, STATE, T1, counter('other'))
    expect(second).toBe(first)
  })

  it('only adds the items that are new', () => {
    const first = ensureIdentities(NO_IDENTITIES, STATE, T0, counter())
    const next = ensureIdentities(
      first,
      { ...STATE, Notes: { ...STATE.Notes, 'c.md': file('c.md') } },
      T1,
      counter('new'),
    )
    expect(Object.keys(next.projects)).toEqual(Object.keys(first.projects))
    expect(Object.keys(next.files)).toHaveLength(3)
    expect(Object.values(next.files).find((f) => f.name === 'c.md')?.nameUpdatedAt).toBe(T1)
  })
})

describe('renameProjectIdentity / renameFileIdentity', () => {
  it('keeps the id and updates name and rename time', () => {
    const ids = ensureIdentities(NO_IDENTITIES, STATE, T0, counter())
    const notesId = Object.entries(ids.projects).find(([, p]) => p.name === 'Notes')![0]

    const renamed = renameProjectIdentity(ids, 'Notes', 'Docs', T1)

    expect(renamed.projects[notesId]).toEqual({ name: 'Docs', nameUpdatedAt: T1 })
    expect(Object.keys(renamed.files)).toEqual(Object.keys(ids.files))
  })

  it('renames a file within its project only', () => {
    const state: ProjectsState = {
      One: { 'x.md': file('x.md') },
      Two: { 'x.md': file('x.md') },
    }
    const ids = ensureIdentities(NO_IDENTITIES, state, T0, counter())

    const renamed = renameFileIdentity(ids, 'Two', 'x.md', 'y.md', T1)

    const names = Object.values(renamed.files)
      .map((f) => f.name)
      .sort()
    expect(names).toEqual(['x.md', 'y.md'])
    const twoId = Object.entries(ids.projects).find(([, p]) => p.name === 'Two')![0]
    expect(Object.values(renamed.files).find((f) => f.name === 'y.md')?.projectId).toBe(twoId)
  })

  it('returns the same reference for an unknown item', () => {
    const ids = ensureIdentities(NO_IDENTITIES, STATE, T0, counter())
    expect(renameProjectIdentity(ids, 'Missing', 'X', T1)).toBe(ids)
    expect(renameFileIdentity(ids, 'Notes', 'missing.md', 'x.md', T1)).toBe(ids)
  })
})

describe('pruneIdentities', () => {
  it('drops entries for items that no longer exist', () => {
    const ids = ensureIdentities(NO_IDENTITIES, STATE, T0, counter())

    const pruned = pruneIdentities(ids, { Notes: { 'a.md': file('a.md') } })

    expect(Object.values(pruned.projects).map((p) => p.name)).toEqual(['Notes'])
    expect(Object.values(pruned.files).map((f) => f.name)).toEqual(['a.md'])
  })

  it('drops the files of a deleted project', () => {
    const ids = ensureIdentities(NO_IDENTITIES, STATE, T0, counter())
    expect(pruneIdentities(ids, { Empty: {} }).files).toEqual({})
  })

  it('returns the same reference when nothing changes', () => {
    const ids = ensureIdentities(NO_IDENTITIES, STATE, T0, counter())
    expect(pruneIdentities(ids, STATE)).toBe(ids)
  })
})

describe('normalizeIdentities', () => {
  it('accepts a well-formed blob', () => {
    const good: Identities = {
      projects: { p1: { name: 'A', nameUpdatedAt: T0 } },
      files: { f1: { projectId: 'p1', name: 'x.md', nameUpdatedAt: T1 } },
    }
    expect(normalizeIdentities(good)).toEqual(good)
  })

  it('degrades to empty for non-objects', () => {
    for (const bad of [null, undefined, 3, 'x', [], { projects: 1, files: 2 }]) {
      expect(normalizeIdentities(bad)).toEqual(NO_IDENTITIES)
    }
  })

  it('drops malformed entries and orphaned files', () => {
    const result = normalizeIdentities({
      projects: {
        ok: { name: 'A', nameUpdatedAt: T0 },
        noName: { name: '', nameUpdatedAt: T0 },
        badTime: { name: 'B', nameUpdatedAt: 'zzz' },
        notObject: 'x',
      },
      files: {
        f1: { projectId: 'ok', name: 'x.md', nameUpdatedAt: T0 },
        orphan: { projectId: 'gone', name: 'y.md', nameUpdatedAt: T0 },
        badName: { projectId: 'ok', name: 5, nameUpdatedAt: T0 },
      },
    })
    expect(Object.keys(result.projects)).toEqual(['ok'])
    expect(Object.keys(result.files)).toEqual(['f1'])
  })
})

// --- alignment / adoption ---------------------------------------------------

const T2 = '2026-03-01T00:00:00.000Z'

function ident(
  projects: Record<string, [string, string]>,
  files: Record<string, [string, string, string]> = {},
): Identities {
  return {
    projects: Object.fromEntries(
      Object.entries(projects).map(([id, [name, t]]) => [id, { name, nameUpdatedAt: t }]),
    ),
    files: Object.fromEntries(
      Object.entries(files).map(([id, [projectId, name, t]]) => [
        id,
        { projectId, name, nameUpdatedAt: t },
      ]),
    ),
  }
}

describe('alignRemote — rename convergence', () => {
  it('applies a newer remote project rename to the local side', () => {
    const result = alignRemote(
      { Notes: { 'a.md': file('a.md') } },
      ident({ p1: ['Notes', T0] }, { f1: ['p1', 'a.md', T0] }),
      { Docs: { 'a.md': file('a.md') } },
      ident({ p1: ['Docs', T1] }, { f1: ['p1', 'a.md', T0] }),
      T2,
      counter(),
    )

    expect(Object.keys(result.local)).toEqual(['Docs'])
    expect(Object.keys(result.remote)).toEqual(['Docs'])
    expect(result.localRenames.projects).toEqual([{ from: 'Notes', to: 'Docs' }])
    expect(result.identities.projects.p1).toEqual({ name: 'Docs', nameUpdatedAt: T1 })
  })

  it('applies a newer local rename to the remote side without reporting a local rename', () => {
    const result = alignRemote(
      { Docs: { 'a.md': file('a.md') } },
      ident({ p1: ['Docs', T1] }, { f1: ['p1', 'a.md', T0] }),
      { Notes: { 'a.md': file('a.md') } },
      ident({ p1: ['Notes', T0] }, { f1: ['p1', 'a.md', T0] }),
      T2,
      counter(),
    )

    expect(Object.keys(result.remote)).toEqual(['Docs'])
    expect(result.localRenames.projects).toEqual([])
    expect(result.localRenames.files).toEqual([])
  })

  it('renames a file inside a project and keeps its position', () => {
    const result = alignRemote(
      { P: { 'first.md': file('first.md'), 'old.md': file('old.md'), 'last.md': file('last.md') } },
      ident(
        { p1: ['P', T0] },
        { f1: ['p1', 'first.md', T0], f2: ['p1', 'old.md', T0], f3: ['p1', 'last.md', T0] },
      ),
      { P: { 'first.md': file('first.md'), 'new.md': file('new.md'), 'last.md': file('last.md') } },
      ident(
        { p1: ['P', T0] },
        { f1: ['p1', 'first.md', T0], f2: ['p1', 'new.md', T1], f3: ['p1', 'last.md', T0] },
      ),
      T2,
      counter(),
    )

    expect(Object.keys(result.local.P ?? {})).toEqual(['first.md', 'new.md', 'last.md'])
    expect(result.local.P?.['new.md']?.name).toBe('new.md')
    expect(result.localRenames.files).toEqual([{ project: 'P', from: 'old.md', to: 'new.md' }])
  })

  it('pairs files by id under a renamed project', () => {
    const result = alignRemote(
      { Notes: { 'a.md': file('a.md') } },
      ident({ p1: ['Notes', T0] }, { f1: ['p1', 'a.md', T0] }),
      { Docs: { 'b.md': file('b.md') } },
      ident({ p1: ['Docs', T1] }, { f1: ['p1', 'b.md', T1] }),
      T2,
      counter(),
    )

    expect(Object.keys(result.local)).toEqual(['Docs'])
    expect(Object.keys(result.local.Docs ?? {})).toEqual(['b.md'])
    expect(result.localRenames.files).toEqual([{ project: 'Docs', from: 'a.md', to: 'b.md' }])
  })

  it('lets the later rename win a concurrent rename', () => {
    const result = alignRemote(
      { Left: {} },
      ident({ p1: ['Left', T1] }),
      { Right: {} },
      ident({ p1: ['Right', T2] }),
      T2,
      counter(),
    )
    expect(Object.keys(result.local)).toEqual(['Right'])
    expect(Object.keys(result.remote)).toEqual(['Right'])
  })

  it('breaks an equal-time tie with the larger name on both sides', () => {
    const a = alignRemote(
      { Left: {} },
      ident({ p1: ['Left', T1] }),
      { Right: {} },
      ident({ p1: ['Right', T1] }),
      T2,
      counter(),
    )
    const b = alignRemote(
      { Right: {} },
      ident({ p1: ['Right', T1] }),
      { Left: {} },
      ident({ p1: ['Left', T1] }),
      T2,
      counter(),
    )
    expect(Object.keys(a.local)).toEqual(['Right'])
    expect(Object.keys(b.local)).toEqual(['Right'])
  })

  it('suffixes the name when the winner collides with a different item', () => {
    const result = alignRemote(
      { Notes: { 'a.md': file('a.md') } },
      ident({ p1: ['Notes', T0] }),
      { Docs: { 'x.md': file('x.md') }, Other: {} },
      ident({ p1: ['Other', T1], p2: ['Docs', T0] }),
      T2,
      counter(),
    )
    // p1 is renamed to "Other" remotely: no collision here, sanity check.
    expect(Object.keys(result.local)).toEqual(['Other'])

    const collision = alignRemote(
      { Docs: { 'a.md': file('a.md') } },
      ident({ p1: ['Docs', T1] }),
      { Notes: { 'a.md': file('a.md') }, Docs: { 'x.md': file('x.md') } },
      ident({ p1: ['Notes', T0], p2: ['Docs', T0] }),
      T2,
      counter(),
    )
    // p1 wins as "Docs" but the remote already has an unrelated "Docs" (p2).
    expect(Object.keys(collision.local)).toContain('Docs (2)')
    expect(Object.keys(collision.remote).sort()).toEqual(['Docs', 'Docs (2)'])
    expect(collision.identities.projects.p1?.name).toBe('Docs (2)')
    expect(collision.identities.projects.p2?.name).toBe('Docs')
    expect(collision.localRenames.projects).toEqual([{ from: 'Docs', to: 'Docs (2)' }])
  })
})

describe('alignRemote — adoption', () => {
  it('lets a remote without identities adopt the local ids by name', () => {
    const localIds = ident({ p1: ['Notes', T0] }, { f1: ['p1', 'a.md', T0] })
    const result = alignRemote(
      { Notes: { 'a.md': file('a.md') } },
      localIds,
      { Notes: { 'a.md': file('a.md'), 'b.md': file('b.md') } },
      NO_IDENTITIES,
      T2,
      counter('new'),
    )

    expect(Object.keys(result.identities.projects)).toEqual(['p1'])
    expect(Object.keys(result.identities.files).sort()).toEqual(['f1', 'new-1'])
    expect(result.localRenames).toEqual({ projects: [], files: [] })
  })

  it('gives unmatched remote items fresh ids', () => {
    const result = alignRemote(
      {},
      NO_IDENTITIES,
      { Remote: { 'a.md': file('a.md') } },
      NO_IDENTITIES,
      T2,
      counter('new'),
    )
    expect(Object.values(result.identities.projects).map((p) => p.name)).toEqual(['Remote'])
    expect(Object.values(result.identities.files).map((f) => f.name)).toEqual(['a.md'])
  })

  it('converges two independently created ids on the smaller one', () => {
    const result = alignRemote(
      { Notes: { 'a.md': file('a.md') } },
      ident({ 'p-b': ['Notes', T0] }, { 'f-b': ['p-b', 'a.md', T0] }),
      { Notes: { 'a.md': file('a.md') } },
      ident({ 'p-a': ['Notes', T0] }, { 'f-a': ['p-a', 'a.md', T0] }),
      T2,
      counter(),
    )

    expect(Object.keys(result.identities.projects)).toEqual(['p-a'])
    expect(Object.keys(result.identities.files)).toEqual(['f-a'])
    expect(result.identities.files['f-a']?.projectId).toBe('p-a')
    expect(result.localRenames).toEqual({ projects: [], files: [] })
  })

  it('does not touch the input states', () => {
    const local: ProjectsState = { Notes: { 'a.md': file('a.md') } }
    const remote: ProjectsState = { Docs: { 'a.md': file('a.md') } }
    const before = JSON.stringify([local, remote])
    alignRemote(
      local,
      ident({ p1: ['Notes', T0] }, { f1: ['p1', 'a.md', T0] }),
      remote,
      ident({ p1: ['Docs', T1] }, { f1: ['p1', 'a.md', T0] }),
      T2,
      counter(),
    )
    expect(JSON.stringify([local, remote])).toBe(before)
  })
})
