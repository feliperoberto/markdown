import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/preact'
import { useEditorFontSize } from './useEditorFontSize'

describe('useEditorFontSize', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty('--font-scale')
  })

  it('defaults to scale 1 when nothing is stored', () => {
    const { result } = renderHook(() => useEditorFontSize())

    expect(result.current.fontScale).toBe('1')
  })

  it('cycles through the font scales (0.5em steps) with wrap-around', () => {
    const { result } = renderHook(() => useEditorFontSize())

    act(() => result.current.cycleFontSize())
    expect(result.current.fontScale).toBe('1.5')

    act(() => result.current.cycleFontSize())
    expect(result.current.fontScale).toBe('2')

    act(() => result.current.cycleFontSize())
    expect(result.current.fontScale).toBe('1')
  })

  it('persists the choice through the storage adapter (localStorage) and restores it on next mount', () => {
    const { result, unmount } = renderHook(() => useEditorFontSize())
    act(() => result.current.cycleFontSize())
    unmount()

    expect(localStorage.getItem('fontScale')).toBe('1.5')

    const { result: second } = renderHook(() => useEditorFontSize())
    expect(second.current.fontScale).toBe('1.5')
  })

  it('ignores a corrupt (or legacy px) stored value and falls back to the default', () => {
    localStorage.setItem('fontScale', '13px')

    const { result } = renderHook(() => useEditorFontSize())

    expect(result.current.fontScale).toBe('1')
  })

  it('applies the scale as the --font-scale CSS custom property (drives both editor and preview)', () => {
    renderHook(() => useEditorFontSize())

    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1')
  })
})
