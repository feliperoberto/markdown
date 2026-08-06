import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForEventOrTimeout } from './waitForEvent'

describe('waitForEventOrTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves as soon as the event fires, without waiting for the timeout', async () => {
    const target = new EventTarget()

    const promise = waitForEventOrTimeout(target, 'ping', 10_000)
    target.dispatchEvent(new Event('ping'))

    await expect(promise).resolves.toBeUndefined()
  })

  it('resolves after the timeout when the event never fires', async () => {
    vi.useFakeTimers()
    const target = new EventTarget()

    const promise = waitForEventOrTimeout(target, 'ping', 50)
    vi.advanceTimersByTime(50)

    await expect(promise).resolves.toBeUndefined()
  })

  it('removes its event listener once settled by the event', async () => {
    const target = new EventTarget()
    const removeSpy = vi.spyOn(target, 'removeEventListener')

    const promise = waitForEventOrTimeout(target, 'ping', 10_000)
    target.dispatchEvent(new Event('ping'))
    await promise

    expect(removeSpy).toHaveBeenCalledWith('ping', expect.any(Function))
  })

  it('does not throw if the event fires again after the timeout already settled it', async () => {
    vi.useFakeTimers()
    const target = new EventTarget()

    const promise = waitForEventOrTimeout(target, 'ping', 50)
    vi.advanceTimersByTime(50)
    await promise

    expect(() => target.dispatchEvent(new Event('ping'))).not.toThrow()
  })
})
