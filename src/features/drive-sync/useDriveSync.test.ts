import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { useDriveSync } from './useDriveSync'
import type { ProjectsSnapshot } from './types'

// Passes the pulled remote snapshot straight through unchanged (or an
// empty snapshot for "nothing synced yet") — good enough for tests that
// don't care about the actual freshness-merge outcome, only that sync ran.
function identityReconcile() {
  return vi.fn((remote: ProjectsSnapshot | null): ProjectsSnapshot => remote ?? { projects: {} })
}

// Never hit real Google endpoints in tests: `google-identity.ts`'s GIS
// script loader is mocked entirely, and the OAuth token client it exposes
// resolves synchronously with a fake token instead of any real
// popup/redirect flow.
vi.mock('./google-identity', () => ({
  loadGoogleIdentity: vi.fn().mockResolvedValue({
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          callback: (response: { access_token: string; expires_in: number }) => void
        }) => ({
          requestAccessToken: () =>
            config.callback({ access_token: 'fake-token', expires_in: 3600 }),
        }),
        revoke: (_token: string, done: () => void) => done(),
      },
    },
  }),
  isGoogleIdentityAvailable: () => true,
}))

const wrapper = ToastProvider

describe('useDriveSync', () => {
  beforeEach(() => {
    localStorage.clear()
    // A real (non-placeholder) Client ID must already be configured for
    // `connect()` to actually attempt authentication.
    localStorage.setItem('driveClientId', 'real-client-id.apps.googleusercontent.com')

    // Mock every Drive/Google network call the connect flow makes
    // (`fetchDriveUser`'s userinfo request) — never real fetches.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: 'Test User' }),
      }),
    )
  })

  afterEach(() => {
    cleanup()
  })

  it('starts disconnected, with configured=true when a real Client ID is stored', () => {
    const { result } = renderHook(() => useDriveSync({ reconcile: identityReconcile() }), {
      wrapper,
    })

    expect(result.current.connected).toBe(false)
    expect(result.current.userName).toBeNull()
    expect(result.current.configured).toBe(true)
  })

  it('connect() moves state from disconnected to connected', async () => {
    const { result } = renderHook(() => useDriveSync({ reconcile: identityReconcile() }), {
      wrapper,
    })

    await act(() => result.current.connect())

    await waitFor(() => expect(result.current.connected).toBe(true))
    expect(result.current.userName).toBe('Test User')
  })

  // needsConfig is the single source of truth both the cloud-icon click
  // handler (app.tsx) and the Ctrl+S handler (DriveSyncPanel) read from —
  // this is a regression test for a bug where the click handler used to
  // check only `configured`, missing the "configured but not connected"
  // case that would otherwise attempt an unauthenticated sync.
  describe('needsConfig', () => {
    it('is true when no Client ID is stored at all', () => {
      localStorage.removeItem('driveClientId')
      const { result } = renderHook(() => useDriveSync({ reconcile: identityReconcile() }), {
        wrapper,
      })

      expect(result.current.configured).toBe(false)
      expect(result.current.connected).toBe(false)
      expect(result.current.needsConfig).toBe(true)
    })

    it('is true when configured but not yet connected', () => {
      const { result } = renderHook(() => useDriveSync({ reconcile: identityReconcile() }), {
        wrapper,
      })

      expect(result.current.configured).toBe(true)
      expect(result.current.connected).toBe(false)
      expect(result.current.needsConfig).toBe(true)
    })

    it('is false once configured and connected', async () => {
      const { result } = renderHook(() => useDriveSync({ reconcile: identityReconcile() }), {
        wrapper,
      })

      await act(() => result.current.connect())
      await waitFor(() => expect(result.current.connected).toBe(true))

      expect(result.current.needsConfig).toBe(false)
    })
  })

  it('disconnect() clears connection and user', async () => {
    const { result } = renderHook(() => useDriveSync({ reconcile: identityReconcile() }), {
      wrapper,
    })

    await act(() => result.current.connect())
    await waitFor(() => expect(result.current.connected).toBe(true))

    act(() => result.current.disconnect())

    expect(result.current.connected).toBe(false)
    expect(result.current.userName).toBeNull()
  })

  // The old two-button pair ("Sincronizar Agora" blind push / "Restaurar
  // do Drive" blind local-wins pull) is gone — one `sync()` action now
  // drives a full pull → reconcile → push cycle.
  it('connecting runs one sync, and sync() runs another', async () => {
    const reconcile = vi.fn(
      (remote: ProjectsSnapshot | null): ProjectsSnapshot => remote ?? { projects: {} },
    )
    const { result } = renderHook(() => useDriveSync({ reconcile }), { wrapper })

    await act(() => result.current.connect())

    // Connecting syncs once on its own (issue #92: sync on connect, not on
    // a background timer). First-ever sync: nothing uploaded yet, so
    // pull() resolves to null — reconcile still runs.
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith(null))
    await waitFor(() => expect(result.current.lastSyncedAt).not.toBeNull())

    reconcile.mockClear()
    await act(() => result.current.sync())
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith(null))
  })

  // Re-entrancy guard: two overlapping sync() calls before the first
  // pull→reconcile→push settles must not run two overlapping sequences.
  it('two overlapping sync() calls only run one sync sequence', async () => {
    const reconcile = vi.fn(
      (remote: ProjectsSnapshot | null): ProjectsSnapshot => remote ?? { projects: {} },
    )
    const { result } = renderHook(() => useDriveSync({ reconcile }), { wrapper })

    await act(() => result.current.connect())
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith(null))

    reconcile.mockClear()
    await act(async () => {
      await Promise.all([result.current.sync(), result.current.sync()])
    })

    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  // Regression test for the highest-confidence finding from an earlier code
  // review: syncInFlightRef used to live only inside the manual-sync
  // handler, so connect()'s own direct performSync() call (right after
  // connecting) was never covered by it. A sync() landing in the window
  // between "status flips to connected" and "connect's own sync finishes"
  // used to start a second, fully overlapping pull→reconcile→push
  // sequence. Deterministically reproduces that exact window by gating the
  // files.list response the connect-time sync's pull() call depends on, so
  // the hook is observably "connected" while that first sync is still
  // provably in flight.
  it('a sync() call arriving while the connect-time sync is still in flight does not start a second overlapping sequence', async () => {
    const reconcile = vi.fn(
      (remote: ProjectsSnapshot | null): ProjectsSnapshot => remote ?? { projects: {} },
    )
    let releasePull: () => void = () => {}
    const pullGate = new Promise<void>((resolve) => {
      releasePull = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('userinfo')) {
          return { ok: true, json: async () => ({ name: 'Test User' }) }
        }
        if (url.includes('drive/v3/files?')) {
          // The connect-time sync's pull() call reaches here — hold it
          // open so the test can observe "connected, but that sync hasn't
          // finished" before letting it proceed.
          await pullGate
          return { ok: true, json: async () => ({ files: [] }) }
        }
        throw new Error(`Unmocked fetch in test: ${url}`)
      }),
    )

    const { result } = renderHook(() => useDriveSync({ reconcile }), { wrapper })

    // Deliberately not wrapped in `act()`/awaited here: this promise must
    // stay unresolved (gated on pullGate) while the assertions below
    // observe the intermediate "connected but still syncing" state.
    // Wrapping it in `act()` would defer the resulting state updates until
    // the callback's own promise settles, hiding the exact window this
    // test needs to see.
    const connectPromise = result.current.connect()

    // connect() itself has resolved the token/user fetch (status is
    // 'connected') but its own performSync()'s pull() is still blocked on
    // pullGate above — this is precisely the window the bug lived in.
    await waitFor(() => expect(result.current.connected).toBe(true))
    expect(reconcile).not.toHaveBeenCalled()

    const syncPromise = result.current.sync()
    releasePull()

    await act(async () => {
      await Promise.all([connectPromise, syncPromise])
    })

    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  // Regression test for issue #92: connecting must NOT start a background
  // polling loop (the loop's periodic token re-request popped a Google
  // auth window that stole editor focus). After the one connect-time sync
  // settles, no further network calls should happen on a timer.
  it('does not start a background auto-sync polling loop after connecting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { result } = renderHook(() => useDriveSync({ reconcile: identityReconcile() }), {
        wrapper,
      })

      await act(() => result.current.connect())
      await vi.waitFor(() => expect(result.current.lastSyncedAt).not.toBeNull())

      const fetchCallsAfterConnectSync = (fetch as ReturnType<typeof vi.fn>).mock.calls.length

      // Advance well past several 60s intervals: with the polling loop
      // removed, nothing should fire on a timer.
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsAfterConnectSync)
    } finally {
      vi.useRealTimers()
    }
  })

  describe('saveClientId / clearClientId', () => {
    // Regression test: an empty/whitespace Client ID was previously saved
    // with a SUCCESS toast, leaving Connect silently disabled with no
    // explanation. The prototype rejected it.
    it('rejects an empty Client ID without persisting it', () => {
      const { result } = renderHook(() => useDriveSync({ reconcile: identityReconcile() }), {
        wrapper,
      })

      let accepted: boolean | undefined
      act(() => {
        accepted = result.current.saveClientId('   ')
      })

      expect(accepted).toBe(false)
      // The already-configured Client ID from beforeEach must be untouched.
      expect(localStorage.getItem('driveClientId')).toBe(
        'real-client-id.apps.googleusercontent.com',
      )
      expect(result.current.configured).toBe(true)
    })

    it('accepts a valid Client ID, persists it, and updates configured immediately', () => {
      const { result } = renderHook(() => useDriveSync({ reconcile: identityReconcile() }), {
        wrapper,
      })

      let accepted: boolean | undefined
      act(() => {
        accepted = result.current.saveClientId('new-id.apps.googleusercontent.com')
      })

      expect(accepted).toBe(true)
      expect(localStorage.getItem('driveClientId')).toBe('new-id.apps.googleusercontent.com')
      expect(result.current.configured).toBe(true)
      expect(result.current.storedClientId).toBe('new-id.apps.googleusercontent.com')
    })

    it('clearClientId() removes the stored value and flips configured to false', () => {
      const { result } = renderHook(() => useDriveSync({ reconcile: identityReconcile() }), {
        wrapper,
      })

      expect(result.current.configured).toBe(true)

      act(() => result.current.clearClientId())

      expect(localStorage.getItem('driveClientId')).toBeNull()
      expect(result.current.configured).toBe(false)
    })
  })
})
