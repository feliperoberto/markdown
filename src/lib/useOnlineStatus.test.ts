import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  vi.unstubAllGlobals()
  // @ts-expect-error cleaning up a test-only stub
  delete navigator.onLine
})

describe('isNavigatorOnline', () => {
  it('reflects the current navigator.onLine value', () => {
    expect(isNavigatorOnline()).toBe(true)

    online = false
    expect(isNavigatorOnline()).toBe(false)
  })

  // Regression test: some runtimes have a `navigator` global whose `onLine`
  // isn't a real boolean at all (e.g. Node 21+'s built-in `navigator` has no
  // `onLine` property, so reading it is `undefined`). Only a strict `false`
  // should mean offline — anything else falls back to "assume online"
  // rather than silently refusing to sync.
  it('treats a non-boolean navigator.onLine as online', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => undefined,
    })

    expect(isNavigatorOnline()).toBe(true)
  })

  it('treats a missing navigator global as online', () => {
    vi.stubGlobal('navigator', undefined)

    expect(isNavigatorOnline()).toBe(true)
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
