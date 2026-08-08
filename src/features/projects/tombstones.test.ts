import { describe, expect, it } from 'vitest'
import { encodeArchivedFileKey, encodeProjectTombstoneKey } from './model'
import {
  clearFileTombstone,
  clearProjectTombstone,
  mergeTombstones,
  normalizeTombstones,
  pruneTombstones,
  recordFileTombstone,
  recordProjectTombstone,
} from './tombstones'

describe('recordFileTombstone / recordProjectTombstone', () => {
  it('records a file tombstone under the same composite key model.ts uses for archived files', () => {
    const result = recordFileTombstone({}, 'A', 'notes', '2026-01-01T00:00:00.000Z')
    expect(result).toEqual({ [encodeArchivedFileKey('A', 'notes')]: '2026-01-01T00:00:00.000Z' })
  })

  it('records a project tombstone under its own single-element key', () => {
    const result = recordProjectTombstone({}, 'A', '2026-01-01T00:00:00.000Z')
    expect(result).toEqual({ [encodeProjectTombstoneKey('A')]: '2026-01-01T00:00:00.000Z' })
  })

  it('returns the same reference when the exact deletedAt is already recorded', () => {
    const existing = recordFileTombstone({}, 'A', 'notes', '2026-01-01T00:00:00.000Z')
    const result = recordFileTombstone(existing, 'A', 'notes', '2026-01-01T00:00:00.000Z')
    expect(result).toBe(existing)
  })
})

describe('clearFileTombstone / clearProjectTombstone', () => {
  it('drops a file tombstone', () => {
    const withTombstone = recordFileTombstone({}, 'A', 'notes', '2026-01-01T00:00:00.000Z')
    const result = clearFileTombstone(withTombstone, 'A', 'notes')
    expect(result).toEqual({})
  })

  it('drops a project tombstone', () => {
    const withTombstone = recordProjectTombstone({}, 'A', '2026-01-01T00:00:00.000Z')
    const result = clearProjectTombstone(withTombstone, 'A')
    expect(result).toEqual({})
  })

  it('returns the same reference when nothing is recorded for that key', () => {
    const empty = {}
    expect(clearFileTombstone(empty, 'A', 'notes')).toBe(empty)
    expect(clearProjectTombstone(empty, 'A')).toBe(empty)
  })
})

describe('mergeTombstones', () => {
  it('keeps the later deletedAt when both sides have the same key', () => {
    const a = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-01T00:00:00.000Z' }
    const b = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-02T00:00:00.000Z' }

    expect(mergeTombstones(a, b)).toEqual({
      [encodeArchivedFileKey('A', 'notes')]: '2026-01-02T00:00:00.000Z',
    })
  })

  it('keeps the earlier deletedAt in place when it is the newer of the two', () => {
    const a = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-02T00:00:00.000Z' }
    const b = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-01T00:00:00.000Z' }

    expect(mergeTombstones(a, b)).toEqual(a)
  })

  it('unions keys unique to either side', () => {
    const a = { [encodeArchivedFileKey('A', 'one')]: '2026-01-01T00:00:00.000Z' }
    const b = { [encodeArchivedFileKey('A', 'two')]: '2026-01-01T00:00:00.000Z' }

    expect(mergeTombstones(a, b)).toEqual({ ...a, ...b })
  })

  it('returns the same reference when b contributes nothing newer', () => {
    const a = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-02T00:00:00.000Z' }
    const b = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-01T00:00:00.000Z' }

    expect(mergeTombstones(a, b)).toBe(a)
  })

  it('returns the same reference when b is empty', () => {
    const a = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-01T00:00:00.000Z' }
    expect(mergeTombstones(a, {})).toBe(a)
  })
})

describe('pruneTombstones', () => {
  const DAY_MS = 24 * 60 * 60 * 1000

  it('drops a tombstone older than the TTL', () => {
    const tombstones = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-01T00:00:00.000Z' }
    const result = pruneTombstones(tombstones, '2026-01-10T00:00:00.000Z', 5 * DAY_MS)
    expect(result).toEqual({})
  })

  it('keeps a tombstone within the TTL', () => {
    const tombstones = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-08T00:00:00.000Z' }
    const result = pruneTombstones(tombstones, '2026-01-10T00:00:00.000Z', 5 * DAY_MS)
    expect(result).toEqual(tombstones)
  })

  it('drops a malformed (unparseable) deletedAt value', () => {
    const tombstones = { [encodeArchivedFileKey('A', 'notes')]: 'not a date' }
    const result = pruneTombstones(tombstones, '2026-01-10T00:00:00.000Z', 5 * DAY_MS)
    expect(result).toEqual({})
  })

  it('returns the same reference when nothing is pruned', () => {
    const tombstones = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-08T00:00:00.000Z' }
    expect(pruneTombstones(tombstones, '2026-01-10T00:00:00.000Z', 5 * DAY_MS)).toBe(tombstones)
  })
})

describe('normalizeTombstones', () => {
  it('keeps a well-formed file-key entry', () => {
    const raw = { [encodeArchivedFileKey('A', 'notes')]: '2026-01-01T00:00:00.000Z' }
    expect(normalizeTombstones(raw)).toEqual(raw)
  })

  it('keeps a well-formed project-key entry', () => {
    const raw = { [encodeProjectTombstoneKey('A')]: '2026-01-01T00:00:00.000Z' }
    expect(normalizeTombstones(raw)).toEqual(raw)
  })

  it('drops a key that does not decode as either a file or a project tombstone key', () => {
    const raw = {
      'not json': '2026-01-01T00:00:00.000Z',
      '["a","b","c"]': '2026-01-01T00:00:00.000Z',
    }
    expect(normalizeTombstones(raw)).toEqual({})
  })

  it('drops a value that is not a parseable ISO timestamp', () => {
    const raw = { [encodeArchivedFileKey('A', 'notes')]: 'not a date' }
    expect(normalizeTombstones(raw)).toEqual({})
  })

  it('drops a non-string value', () => {
    const raw = { [encodeArchivedFileKey('A', 'notes')]: 12345 }
    expect(normalizeTombstones(raw)).toEqual({})
  })

  it('returns an empty object for a non-object input', () => {
    expect(normalizeTombstones(null)).toEqual({})
    expect(normalizeTombstones(undefined)).toEqual({})
    expect(normalizeTombstones('a string')).toEqual({})
    expect(normalizeTombstones(['array'])).toEqual({})
  })
})
