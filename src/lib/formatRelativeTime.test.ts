import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './formatRelativeTime'

describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000

  it('formats less than a minute as "agora"', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('agora')
  })

  it('formats minutes', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('há 5m')
  })

  it('formats hours', () => {
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe('há 3h')
  })

  it('formats days', () => {
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60_000, now)).toBe('há 2d')
  })
})
