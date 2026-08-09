import { describe, expect, it } from 'vitest'
import * as model from './model'
import type { ProjectsState } from './types'

function file(name: string, content: string): ProjectsState[string][string] {
  return { name, content, size: content.length, timestamp: '2026-01-01T00:00:00.000Z' }
}

describe('mergeRestoredProjects', () => {
  // Regression test for the review finding: Drive restore used to full-replace
  // local state (model.replaceProjects), silently deleting any project that
  // existed only locally and wasn't in the backup. The prototype's
  // `driveImport` never did this — it merged with local winning on conflict.
  it('preserves a project that exists only locally and not in the incoming backup', () => {
    const local: ProjectsState = { A: { a: file('a', 'local a') }, B: { b: file('b', 'local b') } }
    const incoming: ProjectsState = { A: { a: file('a', 'backup a') } }

    const result = model.mergeRestoredProjects(local, incoming)

    expect(result.B).toEqual({ b: file('b', 'local b') })
  })

  it('keeps the local file when the same file exists in both local and incoming', () => {
    const local: ProjectsState = { A: { a: file('a', 'local version') } }
    const incoming: ProjectsState = { A: { a: file('a', 'backup version') } }

    const result = model.mergeRestoredProjects(local, incoming)

    expect(result.A?.a?.content).toBe('local version')
  })

  it('adds a project that exists only in the incoming backup', () => {
    const local: ProjectsState = { A: { a: file('a', 'local a') } }
    const incoming: ProjectsState = { C: { c: file('c', 'backup c') } }

    const result = model.mergeRestoredProjects(local, incoming)

    expect(result.A).toBeDefined()
    expect(result.C).toEqual({ c: file('c', 'backup c') })
  })

  it('adds a local-only file within a project that also exists in the backup', () => {
    const local: ProjectsState = { A: { local: file('local', 'x') } }
    const incoming: ProjectsState = { A: { remote: file('remote', 'y') } }

    const result = model.mergeRestoredProjects(local, incoming)

    expect(Object.keys(result.A ?? {}).sort()).toEqual(['local', 'remote'])
  })
})

describe('firstFileOf', () => {
  it('returns the first file of the first project that has one, in order', () => {
    const state: ProjectsState = {
      A: { a1: file('a1', ''), a2: file('a2', '') },
      B: { b1: file('b1', '') },
    }
    expect(model.firstFileOf(state)).toEqual({ project: 'A', file: 'a1' })
  })

  it('skips leading empty projects', () => {
    const state: ProjectsState = { Empty: {}, B: { b1: file('b1', '') } }
    expect(model.firstFileOf(state)).toEqual({ project: 'B', file: 'b1' })
  })

  it('skips files named in skipFiles (archive feature: files)', () => {
    const state: ProjectsState = {
      A: { a1: file('a1', ''), a2: file('a2', '') },
    }
    const skip = new Set([model.encodeArchivedFileKey('A', 'a1')])
    expect(model.firstFileOf(state, undefined, skip)).toEqual({ project: 'A', file: 'a2' })
  })

  it('returns null when every file is skipped via skipFiles', () => {
    const state: ProjectsState = { A: { a1: file('a1', '') } }
    const skip = new Set([model.encodeArchivedFileKey('A', 'a1')])
    expect(model.firstFileOf(state, undefined, skip)).toBeNull()
  })

  it('returns null when no project holds any file', () => {
    expect(model.firstFileOf({ Empty: {} })).toBeNull()
    expect(model.firstFileOf({})).toBeNull()
  })

  it('skips projects named in skipProjects (archive feature)', () => {
    const state: ProjectsState = {
      A: { a1: file('a1', '') },
      B: { b1: file('b1', '') },
    }
    expect(model.firstFileOf(state, new Set(['A']))).toEqual({ project: 'B', file: 'b1' })
  })

  it('returns null when every project with files is skipped', () => {
    const state: ProjectsState = { A: { a1: file('a1', '') } }
    expect(model.firstFileOf(state, new Set(['A']))).toBeNull()
  })

  it('behaves exactly as before when skipProjects is omitted', () => {
    const state: ProjectsState = { A: { a1: file('a1', '') } }
    expect(model.firstFileOf(state)).toEqual({ project: 'A', file: 'a1' })
  })
})

describe('renameInArchived', () => {
  it('swaps the old name for the new one when it was archived', () => {
    const result = model.renameInArchived(new Set(['A', 'B']), 'A', 'A2')
    expect([...result].sort()).toEqual(['A2', 'B'])
  })

  it('returns the same reference when the old name was not archived', () => {
    const archived = new Set(['B'])
    expect(model.renameInArchived(archived, 'A', 'A2')).toBe(archived)
  })
})

describe('pruneArchived', () => {
  it('drops names for projects that no longer exist', () => {
    const state: ProjectsState = { A: { a: file('a', '') } }
    const result = model.pruneArchived(new Set(['A', 'Gone']), state)
    expect([...result]).toEqual(['A'])
  })

  it('returns the same reference when nothing is stale', () => {
    const state: ProjectsState = { A: { a: file('a', '') } }
    const archived = new Set(['A'])
    expect(model.pruneArchived(archived, state)).toBe(archived)
  })

  it('prunes a project literally named "constructor" correctly', () => {
    const state: ProjectsState = { A: { a: file('a', '') } }
    const result = model.pruneArchived(new Set(['constructor']), state)
    expect([...result]).toEqual([])
  })
})

describe('archived-files composite keys', () => {
  it('round-trips a project/file pair through encode/decode', () => {
    const key = model.encodeArchivedFileKey('My Project', 'notes')
    expect(model.decodeArchivedFileKey(key)).toEqual({ project: 'My Project', file: 'notes' })
  })

  it('round-trips names containing slashes, since names are not sanitized at input time', () => {
    const key = model.encodeArchivedFileKey('foo/bar', 'a/b')
    expect(model.decodeArchivedFileKey(key)).toEqual({ project: 'foo/bar', file: 'a/b' })
  })

  it('returns null for a malformed or foreign key, never throwing', () => {
    expect(model.decodeArchivedFileKey('not json')).toBeNull()
    expect(model.decodeArchivedFileKey('{"kind":"file"}')).toBeNull()
    expect(model.decodeArchivedFileKey('["only-one"]')).toBeNull()
    expect(model.decodeArchivedFileKey('[1, 2]')).toBeNull()
  })

  it('isFileArchived checks membership by composite key', () => {
    const archived = new Set([model.encodeArchivedFileKey('A', 'a')])
    expect(model.isFileArchived(archived, 'A', 'a')).toBe(true)
    expect(model.isFileArchived(archived, 'A', 'b')).toBe(false)
    expect(model.isFileArchived(archived, 'B', 'a')).toBe(false)
  })
})

describe('renameFileInArchivedFiles', () => {
  it('rekeys the file segment when the old key was archived', () => {
    const archived = new Set([model.encodeArchivedFileKey('A', 'old')])
    const result = model.renameFileInArchivedFiles(archived, 'A', 'old', 'new')
    expect([...result]).toEqual([model.encodeArchivedFileKey('A', 'new')])
  })

  it('returns the same reference when the old file was not archived', () => {
    const archived = new Set([model.encodeArchivedFileKey('A', 'other')])
    expect(model.renameFileInArchivedFiles(archived, 'A', 'old', 'new')).toBe(archived)
  })
})

describe('moveFileInArchivedFiles', () => {
  it('rekeys the project segment on a cross-project move', () => {
    const archived = new Set([model.encodeArchivedFileKey('A', 'f')])
    const result = model.moveFileInArchivedFiles(archived, 'A', 'f', 'B')
    expect([...result]).toEqual([model.encodeArchivedFileKey('B', 'f')])
  })

  it('is a no-op for a same-project move (reorder only)', () => {
    const archived = new Set([model.encodeArchivedFileKey('A', 'f')])
    expect(model.moveFileInArchivedFiles(archived, 'A', 'f', 'A')).toBe(archived)
  })

  it('returns the same reference when the moved file was not archived', () => {
    const archived = new Set([model.encodeArchivedFileKey('A', 'other')])
    expect(model.moveFileInArchivedFiles(archived, 'A', 'f', 'B')).toBe(archived)
  })
})

describe('renameProjectInArchivedFiles', () => {
  it('rekeys every archived-file entry belonging to the renamed project', () => {
    const archived = new Set([
      model.encodeArchivedFileKey('A', 'x'),
      model.encodeArchivedFileKey('A', 'y'),
      model.encodeArchivedFileKey('B', 'z'),
    ])
    const result = model.renameProjectInArchivedFiles(archived, 'A', 'A2')
    expect([...result].sort()).toEqual(
      [
        model.encodeArchivedFileKey('A2', 'x'),
        model.encodeArchivedFileKey('A2', 'y'),
        model.encodeArchivedFileKey('B', 'z'),
      ].sort(),
    )
  })

  it('returns the same reference when nothing matches the renamed project', () => {
    const archived = new Set([model.encodeArchivedFileKey('B', 'z')])
    expect(model.renameProjectInArchivedFiles(archived, 'A', 'A2')).toBe(archived)
  })
})

describe('dropProjectFromArchivedFiles', () => {
  it('drops every entry belonging to the deleted project', () => {
    const archived = new Set([
      model.encodeArchivedFileKey('A', 'x'),
      model.encodeArchivedFileKey('B', 'z'),
    ])
    const result = model.dropProjectFromArchivedFiles(archived, 'A')
    expect([...result]).toEqual([model.encodeArchivedFileKey('B', 'z')])
  })

  it('returns the same reference when nothing matches', () => {
    const archived = new Set([model.encodeArchivedFileKey('B', 'z')])
    expect(model.dropProjectFromArchivedFiles(archived, 'A')).toBe(archived)
  })
})

describe('pruneArchivedFiles', () => {
  it('drops entries for files that no longer exist', () => {
    const state: ProjectsState = { A: { a: file('a', '') } }
    const archived = new Set([
      model.encodeArchivedFileKey('A', 'a'),
      model.encodeArchivedFileKey('A', 'gone'),
      model.encodeArchivedFileKey('Gone', 'x'),
    ])
    const result = model.pruneArchivedFiles(archived, state)
    expect([...result]).toEqual([model.encodeArchivedFileKey('A', 'a')])
  })

  it('drops malformed entries', () => {
    const state: ProjectsState = { A: { a: file('a', '') } }
    const archived = new Set([model.encodeArchivedFileKey('A', 'a'), 'not json'])
    const result = model.pruneArchivedFiles(archived, state)
    expect([...result]).toEqual([model.encodeArchivedFileKey('A', 'a')])
  })

  it('returns the same reference when nothing is stale', () => {
    const state: ProjectsState = { A: { a: file('a', '') } }
    const archived = new Set([model.encodeArchivedFileKey('A', 'a')])
    expect(model.pruneArchivedFiles(archived, state)).toBe(archived)
  })

  it('prunes a project/file literally named "constructor" correctly', () => {
    const state: ProjectsState = { A: { a: file('a', '') } }
    const result = model.pruneArchivedFiles(
      new Set([model.encodeArchivedFileKey('constructor', 'constructor')]),
      state,
    )
    expect([...result]).toEqual([])
  })

  // Regression: a bare `state[projectName]` truthiness check (rather than an
  // own-property check) resolves through the prototype chain for a project
  // name like "constructor" even when no such project exists, and that
  // inherited function object has its own "name"/"length"/"prototype"
  // properties — so these entries used to survive pruning forever.
  it('prunes stale entries for a non-existent "constructor" project paired with a Function-own-property file name', () => {
    const state: ProjectsState = { A: { a: file('a', '') } }
    const archived = new Set([
      model.encodeArchivedFileKey('constructor', 'name'),
      model.encodeArchivedFileKey('constructor', 'length'),
      model.encodeArchivedFileKey('constructor', 'prototype'),
    ])
    const result = model.pruneArchivedFiles(archived, state)
    expect([...result]).toEqual([])
  })
})

describe('fileExists', () => {
  // Regression: see the pruneArchivedFiles "constructor" test above for the
  // scenario this guards — a project name that doesn't exist in `state` but
  // coincides with an inherited Object.prototype member must never read as
  // "the file exists".
  it('returns false for a non-existent "constructor" project even when the file name is a Function-own property', () => {
    const state: ProjectsState = { A: { a: file('a', '') } }
    expect(model.fileExists(state, 'constructor', 'name')).toBe(false)
    expect(model.fileExists(state, 'constructor', 'length')).toBe(false)
    expect(model.fileExists(state, 'constructor', 'prototype')).toBe(false)
  })

  it('still finds a file inside a project that is genuinely named "constructor"', () => {
    const state: ProjectsState = { constructor: { name: file('name', '') } }
    expect(model.fileExists(state, 'constructor', 'name')).toBe(true)
    expect(model.fileExists(state, 'constructor', 'missing')).toBe(false)
  })
})

describe('moveFile', () => {
  it('reorders a file within its project, inserting before the target', () => {
    const state: ProjectsState = { A: { a: file('a', ''), b: file('b', ''), c: file('c', '') } }
    const result = model.moveFile(state, 'A', 'c', 'A', 'a')
    expect(Object.keys(result.A ?? {})).toEqual(['c', 'a', 'b'])
  })

  it('appends within a project when beforeFile is null', () => {
    const state: ProjectsState = { A: { a: file('a', ''), b: file('b', '') } }
    const result = model.moveFile(state, 'A', 'a', 'A', null)
    expect(Object.keys(result.A ?? {})).toEqual(['b', 'a'])
  })

  it('moves a file to another project, inserting before the target', () => {
    const state: ProjectsState = { A: { a: file('a', 'x') }, B: { b: file('b', '') } }
    const result = model.moveFile(state, 'A', 'a', 'B', 'b')
    expect(Object.keys(result.A ?? {})).toEqual([])
    expect(Object.keys(result.B ?? {})).toEqual(['a', 'b'])
    expect(result.B?.a?.content).toBe('x')
  })

  it('refuses a move that would overwrite a same-named file in the target project', () => {
    const state: ProjectsState = { A: { dup: file('dup', 'a') }, B: { dup: file('dup', 'b') } }
    expect(model.moveFile(state, 'A', 'dup', 'B')).toBe(state)
  })

  it('returns the same reference for unknown file/project or a self-reorder', () => {
    const state: ProjectsState = { A: { a: file('a', '') } }
    expect(model.moveFile(state, 'A', 'missing', 'A')).toBe(state)
    expect(model.moveFile(state, 'A', 'a', 'Nope')).toBe(state)
    expect(model.moveFile(state, 'A', 'a', 'A', 'a')).toBe(state)
  })
})

describe('moveProject', () => {
  it('reorders a project before the target project', () => {
    const state: ProjectsState = { A: {}, B: {}, C: {} }
    const result = model.moveProject(state, 'C', 'A')
    expect(Object.keys(result)).toEqual(['C', 'A', 'B'])
  })

  it('appends the project when beforeProject is null', () => {
    const state: ProjectsState = { A: {}, B: {}, C: {} }
    const result = model.moveProject(state, 'A', null)
    expect(Object.keys(result)).toEqual(['B', 'C', 'A'])
  })

  it('returns the same reference for an unknown project or a self-drop', () => {
    const state: ProjectsState = { A: {}, B: {} }
    expect(model.moveProject(state, 'Nope')).toBe(state)
    expect(model.moveProject(state, 'A', 'A')).toBe(state)
  })
})

describe('mergeProjects (ZIP import)', () => {
  it('lets the incoming file win on a same-key collision (unchanged from before)', () => {
    const base: ProjectsState = { A: { a: file('a', 'old') } }
    const incoming: ProjectsState = { A: { a: file('a', 'new from zip') } }

    const result = model.mergeProjects(base, incoming)

    expect(result.A?.a?.content).toBe('new from zip')
  })
})

function fileAt(name: string, content: string, timestamp: string): ProjectsState[string][string] {
  return { name, content, size: content.length, timestamp }
}

describe('mergeProjectsByFreshness (smart sync)', () => {
  it('keeps the remote version when it has a newer timestamp', () => {
    const local: ProjectsState = { A: { a: fileAt('a', 'old', '2026-01-01T00:00:00.000Z') } }
    const remote: ProjectsState = { A: { a: fileAt('a', 'new', '2026-01-02T00:00:00.000Z') } }

    const result = model.mergeProjectsByFreshness(local, remote)

    expect(result.merged.A?.a?.content).toBe('new')
    expect(result.localChanged).toBe(true)
    expect(result.remoteChanged).toBe(false)
  })

  it('keeps the local version when it has a newer timestamp', () => {
    const local: ProjectsState = { A: { a: fileAt('a', 'new', '2026-01-02T00:00:00.000Z') } }
    const remote: ProjectsState = { A: { a: fileAt('a', 'old', '2026-01-01T00:00:00.000Z') } }

    const result = model.mergeProjectsByFreshness(local, remote)

    expect(result.merged.A?.a?.content).toBe('new')
    expect(result.localChanged).toBe(false)
    expect(result.remoteChanged).toBe(true)
  })

  it('keeps the local version on a timestamp tie, without flagging a remote change', () => {
    const local: ProjectsState = { A: { a: fileAt('a', 'local', '2026-01-01T00:00:00.000Z') } }
    const remote: ProjectsState = { A: { a: fileAt('a', 'remote', '2026-01-01T00:00:00.000Z') } }

    const result = model.mergeProjectsByFreshness(local, remote)

    expect(result.merged.A?.a?.content).toBe('local')
    expect(result.localChanged).toBe(false)
    expect(result.remoteChanged).toBe(false)
  })

  it('keeps files unique to either side (union), never silently dropping either', () => {
    const local: ProjectsState = { A: { onlyLocal: fileAt('onlyLocal', 'x', 't') } }
    const remote: ProjectsState = { A: { onlyRemote: fileAt('onlyRemote', 'y', 't') } }

    const result = model.mergeProjectsByFreshness(local, remote)

    expect(Object.keys(result.merged.A ?? {}).sort()).toEqual(['onlyLocal', 'onlyRemote'])
    expect(result.localChanged).toBe(true)
    expect(result.remoteChanged).toBe(true)
  })

  it('keeps projects unique to either side (union)', () => {
    const local: ProjectsState = { LocalOnly: { a: fileAt('a', 'x', 't') } }
    const remote: ProjectsState = { RemoteOnly: { b: fileAt('b', 'y', 't') } }

    const result = model.mergeProjectsByFreshness(local, remote)

    expect(result.merged.LocalOnly).toBeDefined()
    expect(result.merged.RemoteOnly).toBeDefined()
  })

  it('reports no changes when local and remote are already identical', () => {
    const local: ProjectsState = { A: { a: fileAt('a', 'same', '2026-01-01T00:00:00.000Z') } }
    const remote: ProjectsState = { A: { a: fileAt('a', 'same', '2026-01-01T00:00:00.000Z') } }

    const result = model.mergeProjectsByFreshness(local, remote)

    expect(result.localChanged).toBe(false)
    expect(result.remoteChanged).toBe(false)
  })

  // Tombstones (issue: a renamed/deleted file or project reappearing as a
  // duplicate after Drive sync). A rename is a key move — the old key
  // survives remotely until the next sync, so plain union (the tests
  // above) would resurrect it forever; a tombstone lets the merge tell
  // "never told about the deletion" apart from "genuinely recreated since".
  describe('with tombstones', () => {
    it('drops a remote-only file whose tombstone is newer than the remote content', () => {
      const local: ProjectsState = { A: {} }
      const remote: ProjectsState = {
        A: { old: fileAt('old', 'stale', '2026-01-01T00:00:00.000Z') },
      }
      const tombstones = { [model.encodeArchivedFileKey('A', 'old')]: '2026-01-02T00:00:00.000Z' }

      const result = model.mergeProjectsByFreshness(local, remote, tombstones)

      expect(result.merged.A).toEqual({})
      expect(result.remoteChanged).toBe(true)
      expect(result.localChanged).toBe(false)
    })

    it('keeps a remote-only file whose content is newer than its tombstone (recreated/edited since)', () => {
      const local: ProjectsState = { A: {} }
      const remote: ProjectsState = {
        A: { old: fileAt('old', 'fresh', '2026-01-03T00:00:00.000Z') },
      }
      const tombstones = { [model.encodeArchivedFileKey('A', 'old')]: '2026-01-02T00:00:00.000Z' }

      const result = model.mergeProjectsByFreshness(local, remote, tombstones)

      expect(result.merged.A?.old?.content).toBe('fresh')
      expect(result.localChanged).toBe(true)
    })

    it('never filters a local-only entry, even with a tombstone for its key', () => {
      const local: ProjectsState = {
        A: { mine: fileAt('mine', 'kept', '2026-01-01T00:00:00.000Z') },
      }
      const remote: ProjectsState = { A: {} }
      // A stale/unrelated tombstone for the same key must not suppress the
      // local file — tombstones only ever suppress remote-only entries.
      const tombstones = { [model.encodeArchivedFileKey('A', 'mine')]: '9999-01-01T00:00:00.000Z' }

      const result = model.mergeProjectsByFreshness(local, remote, tombstones)

      expect(result.merged.A?.mine?.content).toBe('kept')
      expect(result.remoteChanged).toBe(true)
    })

    it('drops a whole remote-only project whose tombstone postdates every one of its remote files', () => {
      const local: ProjectsState = {}
      const remote: ProjectsState = {
        Old: {
          a: fileAt('a', 'stale', '2026-01-01T00:00:00.000Z'),
          b: fileAt('b', 'also stale', '2026-01-01T00:00:00.000Z'),
        },
      }
      const tombstones = { [model.encodeProjectTombstoneKey('Old')]: '2026-01-02T00:00:00.000Z' }

      const result = model.mergeProjectsByFreshness(local, remote, tombstones)

      expect(result.merged.Old).toBeUndefined()
      expect(result.remoteChanged).toBe(true)
    })

    it('keeps an EMPTY remote-only project even when a tombstone exists for its name (regression: vacuous truth on Object.values({}).every())', () => {
      // `.every()` on an empty array is vacuously true, so an empty remote
      // project used to always count as "untouched since deletion"
      // regardless of how old the tombstone was — including a tombstone
      // left over from an unrelated, much earlier deletion of that same
      // name, wrongly dropping a legitimate fresh (still-empty) project of
      // the same name created on another device with nothing yet to prove
      // otherwise.
      const local: ProjectsState = {}
      const remote: ProjectsState = { Notes: {} }
      const tombstones = { [model.encodeProjectTombstoneKey('Notes')]: '2020-01-01T00:00:00.000Z' }

      const result = model.mergeProjectsByFreshness(local, remote, tombstones)

      expect(result.merged.Notes).toEqual({})
    })

    it('resurrects a remote-only project whose tombstone predates a later edit to one of its files', () => {
      const local: ProjectsState = {}
      const remote: ProjectsState = {
        Old: {
          a: fileAt('a', 'stale', '2026-01-01T00:00:00.000Z'),
          b: fileAt('b', 'edited after deletion', '2026-01-03T00:00:00.000Z'),
        },
      }
      const tombstones = { [model.encodeProjectTombstoneKey('Old')]: '2026-01-02T00:00:00.000Z' }

      const result = model.mergeProjectsByFreshness(local, remote, tombstones)

      expect(result.merged.Old).toBeDefined()
      expect(Object.keys(result.merged.Old ?? {}).sort()).toEqual(['a', 'b'])
    })

    it('a project tombstone never suppresses a project that still exists locally', () => {
      const local: ProjectsState = {
        Renamed: { a: fileAt('a', 'local', '2026-01-01T00:00:00.000Z') },
      }
      const remote: ProjectsState = {}
      const tombstones = {
        [model.encodeProjectTombstoneKey('Renamed')]: '9999-01-01T00:00:00.000Z',
      }

      const result = model.mergeProjectsByFreshness(local, remote, tombstones)

      expect(result.merged.Renamed?.a?.content).toBe('local')
    })

    it('with no tombstones argument, behaves exactly as the untombstoned tests above (default empty)', () => {
      const local: ProjectsState = { A: {} }
      const remote: ProjectsState = {
        A: { old: fileAt('old', 'stale', '2026-01-01T00:00:00.000Z') },
      }

      const result = model.mergeProjectsByFreshness(local, remote)

      expect(result.merged.A?.old?.content).toBe('stale')
    })
  })
})
