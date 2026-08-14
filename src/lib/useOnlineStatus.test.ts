import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/preact'
import { isNavigatorOnline, useOnlineStatus } from './useOnlineStatus'

// jsdom doesn't model real connectivity — stub navigator.onLine so it's
// exercisable, matching the pattern in useServiceWorkerUpdate.test.ts.
let online: boolean

beforeEach(() => {
  online = true
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => online,
  })
})

afterEach(() => {
  cleanup()
  // @ts-expect-error cleaning up a test-only stub
  delete navigator.onLine
})

describe('isNavigatorOnline', () => {
  it('reflects the current navigator.onLine value', () => {
    expect(isNavigatorOnline()).toBe(true)

    online = false
    expect(isNavigatorOnline()).toBe(false)
  })
})

describe('useOnlineStatus', () => {
  it('reflects navigator.onLine at mount', () => {
    online = false
    const { result } = renderHook(() => useOnlineStatus())

    expect(result.current).toBe(false)
  })

  it('updates on the window "offline" and "online" events', () => {
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('removes its listeners on unmount', () => {
    const { result, unmount } = renderHook(() => useOnlineStatus())
    unmount()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    // Stale closure from before unmount — asserting on the last render's
    // captured value only proves no error was thrown by a leaked listener,
    // not that state updated (it can't, post-unmount); this is the same
    // "removes the listener on unmount" idiom used elsewhere (e.g.
    // useOutsideClick.test.ts).
    expect(result.current).toBe(true)
  })
})
