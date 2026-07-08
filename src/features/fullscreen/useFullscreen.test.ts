import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/preact'
import { useFullscreen } from './useFullscreen'

// jsdom implements neither the Fullscreen API nor its element/document
// properties, so every entry point is stubbed directly on the relevant
// object rather than relying on real browser fullscreen behavior.
describe('useFullscreen', () => {
  let fullscreenElement: Element | null = null
  let requestFullscreen: ReturnType<typeof vi.fn>
  let exitFullscreen: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fullscreenElement = null
    requestFullscreen = vi.fn().mockImplementation(() => {
      fullscreenElement = document.documentElement
      return Promise.resolve()
    })
    exitFullscreen = vi.fn().mockImplementation(() => {
      fullscreenElement = null
      return Promise.resolve()
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    document.documentElement.requestFullscreen = requestFullscreen
    document.exitFullscreen = exitFullscreen
  })

  afterEach(() => {
    // @ts-expect-error cleaning up a test-only stub
    delete document.documentElement.requestFullscreen
    // @ts-expect-error cleaning up a test-only stub
    delete document.exitFullscreen
  })

  it('starts as not fullscreen', () => {
    const { result } = renderHook(() => useFullscreen())
    expect(result.current.isFullscreen).toBe(false)
  })

  it('requests fullscreen when toggled while not fullscreen', () => {
    const { result } = renderHook(() => useFullscreen())

    act(() => result.current.toggleFullscreen())

    expect(requestFullscreen).toHaveBeenCalledOnce()
    expect(exitFullscreen).not.toHaveBeenCalled()
  })

  it('exits fullscreen when toggled while already fullscreen', () => {
    fullscreenElement = document.documentElement
    const { result } = renderHook(() => useFullscreen())
    expect(result.current.isFullscreen).toBe(true)

    act(() => result.current.toggleFullscreen())

    expect(exitFullscreen).toHaveBeenCalledOnce()
    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it('updates isFullscreen when the browser fires fullscreenchange', () => {
    const { result } = renderHook(() => useFullscreen())

    act(() => {
      fullscreenElement = document.documentElement
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    expect(result.current.isFullscreen).toBe(true)
  })

  it('does not throw when requestFullscreen/exitFullscreen are unsupported (iOS Safari)', () => {
    // @ts-expect-error simulating iOS Safari, where non-<video> elements
    // have no requestFullscreen at all.
    delete document.documentElement.requestFullscreen
    // @ts-expect-error same for exitFullscreen
    delete document.exitFullscreen

    const { result } = renderHook(() => useFullscreen())

    expect(() => act(() => result.current.toggleFullscreen())).not.toThrow()
  })
})
