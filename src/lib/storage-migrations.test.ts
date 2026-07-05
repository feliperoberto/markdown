import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, isEnvelope, migrateStoredProjects } from './storage-migrations'
import type { ProjectsState } from '@/features/projects/types'

describe('isEnvelope', () => {
  it('returns true for a well-formed envelope', () => {
    expect(isEnvelope({ schemaVersion: 1, projects: {} })).toBe(true)
  })

  it('returns false for a legacy raw ProjectsState blob (no schemaVersion)', () => {
    expect(isEnvelope({ 'My Project': {} })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isEnvelope(null)).toBe(false)
  })

  it('returns false for an array', () => {
    expect(isEnvelope([])).toBe(false)
  })

  it('returns false when schemaVersion is not a number', () => {
    expect(isEnvelope({ schemaVersion: '1', projects: {} })).toBe(false)
  })

  it('returns false when projects is missing', () => {
    expect(isEnvelope({ schemaVersion: 1 })).toBe(false)
  })
})

describe('migrateStoredProjects', () => {
  it('lifts a legacy (un-versioned) raw ProjectsState blob to the current schema version', () => {
    const legacy: ProjectsState = {
      'My Project': {
        'notes.md': { name: 'notes.md', content: '# hi', size: 4, timestamp: '2024-01-01T00:00:00.000Z' },
      },
    }

    const envelope = migrateStoredProjects(legacy)

    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(envelope.projects).toEqual(legacy)
  })

  it('treats missing/null/undefined raw data as an empty legacy blob', () => {
    expect(migrateStoredProjects(null).projects).toEqual({})
    expect(migrateStoredProjects(undefined).projects).toEqual({})
  })

  it('treats a non-object legacy blob (e.g. a stray string) as empty rather than throwing', () => {
    const envelope = migrateStoredProjects('not-an-object')

    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(envelope.projects).toEqual({})
  })

  it('is a no-op for data already at the current schema version', () => {
    const current = { schemaVersion: CURRENT_SCHEMA_VERSION, projects: { A: {} } }

    expect(migrateStoredProjects(current)).toEqual(current)
  })

  it('runs the registered 0 -> 1 migration for an explicit schemaVersion 0 envelope', () => {
    const v0 = { schemaVersion: 0, projects: { A: {} } }

    const envelope = migrateStoredProjects(v0)

    expect(envelope.schemaVersion).toBe(1)
    expect(envelope.projects).toEqual({ A: {} })
  })

  it('stops migrating (without throwing) when no migration is registered for a version', () => {
    // Simulate data stamped with a schemaVersion from the future / with no
    // migration path defined — must not infinite-loop or throw.
    const future = { schemaVersion: 99, projects: {} }

    const envelope = migrateStoredProjects(future)

    expect(envelope.schemaVersion).toBe(99)
    expect(envelope.projects).toEqual({})
  })
})
