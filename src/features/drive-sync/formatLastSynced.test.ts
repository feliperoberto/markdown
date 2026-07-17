import { describe, expect, it } from 'vitest'
import { formatLastSynced } from './formatLastSynced'

describe('formatLastSynced', () => {
  const now = 1_700_000_000_000

  it('returns null for "never synced"', () => {
    expect(formatLastSynced(null, now)).toBeNull()
  })

  // The actual relative-time wording (minutes/hours/days) is covered by
  // formatRelativeTime.test.ts, which this now delegates to — just prove
  // the delegation happens.
  it('delegates non-null timestamps to formatRelativeTime', () => {
    expect(formatLastSynced(now - 5 * 60_000, now)).toBe('há 5m')
  })
})
