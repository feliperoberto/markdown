import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/preact'
import { useSplashScreen } from './useSplashScreen'

describe('useSplashScreen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('is visible by default when nothing is stored', () => {
    const { result } = renderHook(() => useSplashScreen())
    expect(result.current.isVisible).toBe(true)
  })

  it('is hidden on mount when the user previously dismissed it permanently', () => {
    localStorage.setItem('splashDismissed', 'true')
    const { result } = renderHook(() => useSplashScreen())
    expect(result.current.isVisible).toBe(false)
  })

  it('dismiss(false) hides it for this session but does not persist the choice', () => {
    const { result } = renderHook(() => useSplashScreen())

    act(() => result.current.dismiss(false))

    expect(result.current.isVisible).toBe(false)
    expect(localStorage.getItem('splashDismissed')).toBeNull()
  })

  it('dismiss(true) hides it and persists the choice for future loads', () => {
    const { result } = renderHook(() => useSplashScreen())

    act(() => result.current.dismiss(true))

    expect(result.current.isVisible).toBe(false)
    expect(localStorage.getItem('splashDismissed')).toBe('true')

    const { result: second } = renderHook(() => useSplashScreen())
    expect(second.current.isVisible).toBe(false)
  })
})
