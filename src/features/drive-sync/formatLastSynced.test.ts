import { describe, expect, it } from 'vitest'
import { formatLastSynced } from './formatLastSynced'

describe('formatLastSynced', () => {
  const now = 1_700_000_000_000

  it('returns null for "never synced"', () => {
    expect(formatLastSynced(null, now)).toBeNull()
  })

  it('formats less than a minute as "agora"', () => {
    expect(formatLastSynced(now - 30_000, now)).toBe('agora')
  })

  it('formats minutes', () => {
    expect(formatLastSynced(now - 5 * 60_000, now)).toBe('há 5m')
  })

  it('formats hours', () => {
    expect(formatLastSynced(now - 3 * 60 * 60_000, now)).toBe('há 3h')
  })

  it('formats days', () => {
    expect(formatLastSynced(now - 2 * 24 * 60 * 60_000, now)).toBe('há 2d')
  })
})
