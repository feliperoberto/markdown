import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/preact'
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate'
import type { RegisterServiceWorkerUpdates, ServiceWorkerUpdateHandlers } from '@/lib/pwa-register'

// A fake registrar standing in for `@/lib/pwa-register`'s real
// `registerServiceWorkerUpdates` — the hook takes it as an injected
// option specifically so tests never have to resolve the build-time
// `virtual:pwa-register` module (see useServiceWorkerUpdate.ts's header
// comment and @/lib/pwa-register's).
function createFakeRegistrar() {
  let handlers: ServiceWorkerUpdateHandlers | null = null
  const updateMock = vi.fn().mockResolvedValue(undefined)
  const applyUpdateMock = vi.fn().mockResolvedValue(undefined)
  const registration = { update: updateMock } as unknown as ServiceWorkerRegistration

  const register: RegisterServiceWorkerUpdates = (h) => {
    handlers = h
    return { applyUpdate: applyUpdateMock }
  }

  return {
    register,
    updateMock,
    applyUpdateMock,
    registration,
    getHandlers: (): ServiceWorkerUpdateHandlers => {
      if (!handlers) throw new Error('register() was not called yet')
      return handlers
    },
  }
}

describe('useServiceWorkerUpdate', () => {
  let currentTime: number
  let visible: boolean
  let online: boolean
  const now = () => currentTime

  beforeEach(() => {
    currentTime = 0
    visible = true
    online = true
    // jsdom doesn't model real visibility/connectivity — stub both so
    // check()'s guards are exercisable, matching the stubbing pattern in
    // useFullscreen.test.ts.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (visible ? 'visible' : 'hidden'),
    })
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => online,
    })
  })

  afterEach(() => {
    // @ts-expect-error cleaning up a test-only stub
    delete document.visibilityState
    // @ts-expect-error cleaning up a test-only stub
    delete navigator.onLine
  })

  it('has no update available immediately after mount', () => {
    const { register } = createFakeRegistrar()
    const { result } = renderHook(() => useServiceWorkerUpdate({ register, now }))

    expect(result.current.needRefresh).toBe(false)
  })

  it('reports an update once the registrar reports a waiting worker', () => {
    const fake = createFakeRegistrar()
    const { result } = renderHook(() => useServiceWorkerUpdate({ register: fake.register, now }))

    act(() => fake.getHandlers().onNeedRefresh())

    expect(result.current.needRefresh).toBe(true)
  })

  it('applyUpdate promotes the waiting worker via the registrar', () => {
    const fake = createFakeRegistrar()
    const { result } = renderHook(() => useServiceWorkerUpdate({ register: fake.register, now }))
    act(() => fake.getHandlers().onNeedRefresh())

    act(() => result.current.applyUpdate())

    expect(fake.applyUpdateMock).toHaveBeenCalledOnce()
  })

  it('dismiss hides the banner without touching localStorage', () => {
    const fake = createFakeRegistrar()
    const { result } = renderHook(() => useServiceWorkerUpdate({ register: fake.register, now }))
    act(() => fake.getHandlers().onNeedRefresh())
    expect(result.current.needRefresh).toBe(true)

    act(() => result.current.dismiss())

    expect(result.current.needRefresh).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('probes once on load, as soon as registration completes', () => {
    const fake = createFakeRegistrar()
    renderHook(() => useServiceWorkerUpdate({ register: fake.register, now }))

    act(() => fake.getHandlers().onRegistered(fake.registration))

    expect(fake.updateMock).toHaveBeenCalledOnce()
  })

  it('re-checks on window focus once past the throttle window', () => {
    const fake = createFakeRegistrar()
    renderHook(() =>
      useServiceWorkerUpdate({ register: fake.register, now, minCheckIntervalMs: 1000 }),
    )
    act(() => fake.getHandlers().onRegistered(fake.registration))
    expect(fake.updateMock).toHaveBeenCalledOnce() // the on-load probe

    currentTime += 2000
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(fake.updateMock).toHaveBeenCalledTimes(2)
  })

  it('re-checks on the online event', () => {
    const fake = createFakeRegistrar()
    renderHook(() =>
      useServiceWorkerUpdate({ register: fake.register, now, minCheckIntervalMs: 1000 }),
    )
    act(() => fake.getHandlers().onRegistered(fake.registration))

    currentTime += 2000
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(fake.updateMock).toHaveBeenCalledTimes(2)
  })

  it('does not re-check within the throttle window', () => {
    const fake = createFakeRegistrar()
    renderHook(() =>
      useServiceWorkerUpdate({ register: fake.register, now, minCheckIntervalMs: 1000 }),
    )
    act(() => fake.getHandlers().onRegistered(fake.registration))
    expect(fake.updateMock).toHaveBeenCalledOnce()

    currentTime += 100 // still inside the 1000ms window
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(fake.updateMock).toHaveBeenCalledOnce()
  })

  it('does not check when the tab is hidden', () => {
    const fake = createFakeRegistrar()
    renderHook(() => useServiceWorkerUpdate({ register: fake.register, now }))
    act(() => fake.getHandlers().onRegistered(fake.registration))
    expect(fake.updateMock).toHaveBeenCalledOnce()

    visible = false
    currentTime += 120_000
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(fake.updateMock).toHaveBeenCalledOnce()
  })

  it('does not check when offline', () => {
    const fake = createFakeRegistrar()
    renderHook(() => useServiceWorkerUpdate({ register: fake.register, now }))
    act(() => fake.getHandlers().onRegistered(fake.registration))
    expect(fake.updateMock).toHaveBeenCalledOnce()

    online = false
    currentTime += 120_000
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(fake.updateMock).toHaveBeenCalledOnce()
  })

  it('swallows a rejected update() probe without an unhandled rejection', async () => {
    const fake = createFakeRegistrar()
    fake.updateMock.mockRejectedValueOnce(new Error('offline'))
    renderHook(() => useServiceWorkerUpdate({ register: fake.register, now }))

    expect(() => act(() => fake.getHandlers().onRegistered(fake.registration))).not.toThrow()
    // Flush the rejected promise's microtask so its .catch() runs within
    // this test, not leaking into the next one.
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('does nothing when service workers are unsupported (no registration)', () => {
    const fake = createFakeRegistrar()
    renderHook(() => useServiceWorkerUpdate({ register: fake.register, now }))
    act(() => fake.getHandlers().onRegistered(undefined))

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(fake.updateMock).not.toHaveBeenCalled()
  })

  it('registers exactly once even if the hook re-renders', () => {
    const fake = createFakeRegistrar()
    const registerSpy = vi.fn(fake.register)
    const { rerender } = renderHook((props) => useServiceWorkerUpdate(props), {
      initialProps: { register: registerSpy, now },
    })

    rerender({ register: registerSpy, now })
    rerender({ register: registerSpy, now })

    expect(registerSpy).toHaveBeenCalledOnce()
  })

  it('removes its event listeners on unmount', () => {
    const fake = createFakeRegistrar()
    const { unmount } = renderHook(() => useServiceWorkerUpdate({ register: fake.register, now }))
    act(() => fake.getHandlers().onRegistered(fake.registration))
    expect(fake.updateMock).toHaveBeenCalledOnce()

    unmount()
    currentTime += 120_000
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))

    expect(fake.updateMock).toHaveBeenCalledOnce() // unchanged after unmount
  })
})
