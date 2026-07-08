import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/preact'
import { useTheme } from './useTheme'

function mockPrefersDark(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' && matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    mockPrefersDark(false)
  })

  it('defaults to light when nothing is stored and the system prefers light', () => {
    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('defaults to dark when nothing is stored and the system prefers dark', () => {
    mockPrefersDark(true)

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('dark')
  })

  it('a stored preference overrides the system prefers-color-scheme', () => {
    mockPrefersDark(true)
    localStorage.setItem('theme', 'light')

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('light')
  })

  it('toggleTheme flips the theme, sets data-theme, and persists the choice', () => {
    const { result, unmount } = renderHook(() => useTheme())

    act(() => result.current.toggleTheme())

    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')

    unmount()

    const { result: second } = renderHook(() => useTheme())
    expect(second.current.theme).toBe('dark')
  })

  it('ignores a corrupt stored value and falls back to the system preference', () => {
    localStorage.setItem('theme', 'not-a-real-theme')

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('light')
  })
})
