import { afterEach, describe, expect, it, vi } from 'vitest'

describe('appVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('falls back to "dev" when Vite has not injected __APP_VERSION__ (e.g. under Vitest)', async () => {
    const { appVersion } = await import('./app-version')
    expect(appVersion).toBe('dev')
  })

  it('reflects the injected build identity when present', async () => {
    vi.stubGlobal('__APP_VERSION__', '9.9.9+abc1234')
    vi.resetModules()

    const { appVersion } = await import('./app-version')

    expect(appVersion).toBe('9.9.9+abc1234')
  })
})
