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
})
