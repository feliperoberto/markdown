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
