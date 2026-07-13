import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/preact'
import { useEditorFontSize } from './useEditorFontSize'

describe('useEditorFontSize', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty('--editor-font-size')
  })

  it('defaults to 13px when nothing is stored', () => {
    const { result } = renderHook(() => useEditorFontSize())

    expect(result.current.fontSize).toBe('13px')
  })

  it('cycles through the font sizes with wrap-around', () => {
    const { result } = renderHook(() => useEditorFontSize())

    act(() => result.current.cycleFontSize())
    expect(result.current.fontSize).toBe('15px')

    act(() => result.current.cycleFontSize())
    expect(result.current.fontSize).toBe('17px')

    act(() => result.current.cycleFontSize())
    expect(result.current.fontSize).toBe('13px')
  })

  it('persists the choice through the storage adapter (localStorage) and restores it on next mount', () => {
    const { result, unmount } = renderHook(() => useEditorFontSize())
    act(() => result.current.cycleFontSize())
    unmount()

    expect(localStorage.getItem('fontScale')).toBe('15px')

    const { result: second } = renderHook(() => useEditorFontSize())
    expect(second.current.fontSize).toBe('15px')
  })

  it('ignores a corrupt stored value and falls back to the default', () => {
    localStorage.setItem('fontScale', 'not-a-real-size')

    const { result } = renderHook(() => useEditorFontSize())

    expect(result.current.fontSize).toBe('13px')
  })

  it('applies the font size as the --editor-font-size CSS custom property', () => {
    renderHook(() => useEditorFontSize())

    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('13px')
  })
})
