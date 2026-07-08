import { describe, expect, it } from 'vitest'
import { normalizeProjectsState } from './validate'

describe('normalizeProjectsState', () => {
  it('returns an empty state for non-object input', () => {
    expect(normalizeProjectsState(null)).toEqual({})
    expect(normalizeProjectsState(undefined)).toEqual({})
    expect(normalizeProjectsState('not an object')).toEqual({})
    expect(normalizeProjectsState(42)).toEqual({})
    expect(normalizeProjectsState([])).toEqual({})
  })

  it('passes through a well-formed ProjectsState unchanged in shape', () => {
    const input = {
      Project: {
        notes: { name: 'notes', content: 'hello', size: 5, timestamp: '2026-01-01T00:00:00.000Z' },
      },
    }

    const result = normalizeProjectsState(input)

    expect(result).toEqual(input)
  })

  it('keeps an empty project (no files) — that is a legal state, not malformed', () => {
    const result = normalizeProjectsState({ 'Empty Project': {} })

    expect(result).toEqual({ 'Empty Project': {} })
  })

  // Regression test: restore/merge previously trusted file.name === key
  // without checking, so a backup where a file's `name` field disagreed
  // with its object key orphaned the file (clicking it read the wrong
  // key, renaming it silently no-op'd).
  it('forces file.name to match its object key, ignoring a disagreeing name field', () => {
    const result = normalizeProjectsState({
      Project: { realKey: { name: 'wrong-name', content: 'x', size: 1, timestamp: 't' } },
    })

    expect(result.Project?.realKey?.name).toBe('realKey')
  })

  it('recomputes size from content.length rather than trusting the incoming value', () => {
    const result = normalizeProjectsState({
      Project: { notes: { name: 'notes', content: 'hello world', size: 999, timestamp: 't' } },
    })

    expect(result.Project?.notes?.size).toBe('hello world'.length)
  })

  it('drops a file whose content is not a string', () => {
    const result = normalizeProjectsState({
      Project: {
        bad: { name: 'bad', content: 42, size: 1, timestamp: 't' },
        good: { name: 'good', content: 'ok', size: 2, timestamp: 't' },
      },
    })

    expect(Object.keys(result.Project ?? {})).toEqual(['good'])
  })

  it('drops a project whose value is not a plain object', () => {
    const result = normalizeProjectsState({ Project: 'not an object', Good: {} })

    expect(result).toEqual({ Project: {}, Good: {} })
  })

  it('coerces a missing/invalid timestamp to a string rather than dropping the file', () => {
    const result = normalizeProjectsState({
      Project: { notes: { name: 'notes', content: 'x', size: 1 } },
    })

    expect(typeof result.Project?.notes?.timestamp).toBe('string')
  })

  // Regression test: restore previously skipped the structural/path
  // sanitization that ZIP import applies via sanitizeNameSegment.
  it('strips path-traversal segments from project and file names', () => {
    const result = normalizeProjectsState({
      '../../etc': { '../passwd': { name: 'x', content: 'y', size: 1, timestamp: 't' } },
    })

    expect(Object.keys(result)).toEqual(['etc'])
    expect(Object.keys(result.etc ?? {})).toEqual(['passwd'])
  })

  it('drops a project whose sanitized name becomes empty', () => {
    const result = normalizeProjectsState({ '...': {} })

    expect(result).toEqual({})
  })
})
