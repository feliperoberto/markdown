import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { DriveSyncPanel } from './DriveSyncPanel'
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

describe('DriveSyncPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    // A real (non-placeholder) Client ID must already be configured for the
    // "Conectar com Google" button to be enabled.
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

  it('connecting to Drive moves the panel from disconnected to connected sync state', async () => {
    render(
      <ToastProvider>
        <DriveSyncPanel reconcile={identityReconcile()} open={true} onClose={() => {}} />
      </ToastProvider>,
    )

    expect(screen.queryByText('Configure sua conta Google Drive')).not.toBeNull()
    expect(screen.queryByText(/Conectado como/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Conectar com Google' }))

    await waitFor(() => expect(screen.queryByText('Conectado como Test User')).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Desconectar' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Conectar com Google' })).toBeNull()
  })

  // Regression test: the cloud icon button should trigger opening the modal.
  // With the split, clicking the cloud button doesn't directly open the modal
  // anymore (modal is controlled by parent), so we test that it's rendered
  // when the open prop is true.
  it('renders the sync modal when open prop is true', () => {
    render(
      <ToastProvider>
        <DriveSyncPanel reconcile={identityReconcile()} open={true} onClose={() => {}} />
      </ToastProvider>,
    )

    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Sincronizar' })).not.toBeNull()
  })

  it('accepts a valid Client ID and shows a success toast', async () => {
    render(
      <ToastProvider>
        <DriveSyncPanel reconcile={identityReconcile()} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sincronização com Google Drive' }))
    const input = screen.getByLabelText('Client ID')
    fireEvent.input(input, { target: { value: 'new-id.apps.googleusercontent.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Client ID' }))

    await waitFor(() => expect(screen.getByText('✅ Configuração salva')).not.toBeNull())
    expect(localStorage.getItem('driveClientId')).toBe('new-id.apps.googleusercontent.com')
  })

  // The old two-button pair ("Sincronizar Agora" blind push / "Restaurar
  // do Drive" blind local-wins pull) is gone — one "Sincronizar" button
  // now drives a full pull → reconcile → push cycle.
  it('connecting runs one sync, and the "Sincronizar" button runs another', async () => {
    const reconcile = vi.fn(
      (remote: ProjectsSnapshot | null): ProjectsSnapshot => remote ?? { projects: {} },
    )
    render(
      <ToastProvider>
        <DriveSyncPanel reconcile={reconcile} open={true} onClose={() => {}} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Conectar com Google' }))
    await waitFor(() => expect(screen.queryByText('Conectado como Test User')).not.toBeNull())

    expect(screen.queryByRole('button', { name: 'Restaurar do Drive' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sincronizar Agora' })).toBeNull()

    // Connecting syncs once on its own (issue #92: sync on connect, not on
    // a background timer). First-ever sync: nothing uploaded yet, so
    // pull() resolves to null — reconcile still runs.
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith(null))
    await waitFor(() => expect(screen.queryByText(/Última sincronização/)).not.toBeNull())

    reconcile.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar' }))
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith(null))
  })

  // Ctrl+S/Cmd+S (useSaveShortcut, wired in src/app/app.tsx) bumps
  // `actionSignal` (action: 'sync') instead of calling anything on this
  // component directly — this is the receiving end of that signal.
  describe('actionSignal: sync (Ctrl+S/Cmd+S)', () => {
    it('runs a sync when bumped while connected', async () => {
      const reconcile = vi.fn(
        (remote: ProjectsSnapshot | null): ProjectsSnapshot => remote ?? { projects: {} },
      )
      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel reconcile={reconcile} open={true} onClose={() => {}} />
        </ToastProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Conectar com Google' }))
      // Wait for the connect-time sync (issue #92) to actually finish, not
      // just for "Conectado como" to appear — that text lands as soon as
      // connect()'s fetchDriveUser resolves, before the still-in-flight
      // connect-time performSync's own reconcile() call fires.
      await waitFor(() => expect(reconcile).toHaveBeenCalledWith(null))

      reconcile.mockClear()
      rerender(
        <ToastProvider>
          <DriveSyncPanel reconcile={reconcile} open={true} onClose={() => {}} actionSignal={{ action: 'sync', nonce: 1 }} />
        </ToastProvider>,
      )

      await waitFor(() => expect(reconcile).toHaveBeenCalledWith(null))
    })

    it('shows a warning toast instead of syncing when not connected', async () => {
      const reconcile = vi.fn(
        (remote: ProjectsSnapshot | null): ProjectsSnapshot => remote ?? { projects: {} },
      )
      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel reconcile={reconcile} open={true} onClose={() => {}} />
        </ToastProvider>,
      )

      expect(screen.queryByRole('dialog')).not.toBeNull()

      rerender(
        <ToastProvider>
          <DriveSyncPanel reconcile={reconcile} open={true} onClose={() => {}} actionSignal={{ action: 'sync', nonce: 1 }} />
        </ToastProvider>,
      )

      await waitFor(() =>
        expect(screen.getByText('Conecte o Google Drive para sincronizar')).not.toBeNull(),
      )
      expect(screen.getByRole('dialog')).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Conectar com Google' })).not.toBeNull()
      expect(reconcile).not.toHaveBeenCalled()
    })

    // Re-entrancy guard: two Ctrl+S presses batched before the first
    // pull→reconcile→push settles must not run two overlapping sequences.
    it('two rapid bumps in flight only run one sync sequence', async () => {
      const reconcile = vi.fn(
        (remote: ProjectsSnapshot | null): ProjectsSnapshot => remote ?? { projects: {} },
      )
      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel reconcile={reconcile} open={true} onClose={() => {}} />
        </ToastProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Conectar com Google' }))
      // See the previous test's comment: wait for the connect-time sync to
      // actually finish before clearing, not just for the "Conectado como"
      // text.
      await waitFor(() => expect(reconcile).toHaveBeenCalledWith(null))

      reconcile.mockClear()
      rerender(
        <ToastProvider>
          <DriveSyncPanel reconcile={reconcile} open={true} onClose={() => {}} actionSignal={{ action: 'sync', nonce: 1 }} />
        </ToastProvider>,
      )
      rerender(
        <ToastProvider>
          <DriveSyncPanel reconcile={reconcile} open={true} onClose={() => {}} actionSignal={{ action: 'sync', nonce: 2 }} />
        </ToastProvider>,
      )

      await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1))
      // Give any accidental second sequence a chance to also resolve before
      // asserting it never happened.
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(reconcile).toHaveBeenCalledTimes(1)
    })

    // Regression test for the highest-confidence finding from code review:
    // syncInFlightRef used to live only inside handleSync(), so
    // handleConnect()'s own direct performSync() call (right after
    // connecting) was never covered by it. A Ctrl+S landing in the window
    // between "status flips to connected" and "handleConnect's own sync
    // finishes" used to start a second, fully overlapping pull→reconcile→
    // push sequence. Deterministically reproduces that exact window by
    // gating the files.list response the connect-time sync's pull() call
    // depends on, so the panel is observably "connected" (Desconectar
    // button visible) while that first sync is still provably in flight.
    it('a sync signal arriving while the connect-time sync is still in flight does not start a second overlapping sequence', async () => {
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
            // open so the test can observe "connected, but that sync
            // hasn't finished" before letting it proceed.
            await pullGate
            return { ok: true, json: async () => ({ files: [] }) }
          }
          throw new Error(`Unmocked fetch in test: ${url}`)
        }),
      )

      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel reconcile={reconcile} open={true} onClose={() => {}} />
        </ToastProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Conectar com Google' }))

      // connect() itself has resolved (status is 'connected') but its own
      // performSync()'s pull() is still blocked on pullGate above — this is
      // precisely the window the bug lived in.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Desconectar' })).not.toBeNull(),
      )
      expect(reconcile).not.toHaveBeenCalled()

      rerender(
        <ToastProvider>
          <DriveSyncPanel reconcile={reconcile} open={true} onClose={() => {}} actionSignal={{ action: 'sync', nonce: 1 }} />
        </ToastProvider>,
      )

      releasePull()

      await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1))
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(reconcile).toHaveBeenCalledTimes(1)
    })
  })

  // Regression test for issue #92: connecting must NOT start a background
  // polling loop (the loop's periodic token re-request popped a Google
  // auth window that stole editor focus). After the one connect-time sync
  // settles, no further network calls should happen on a timer.
  it('does not start a background auto-sync polling loop after connecting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(
        <ToastProvider>
          <DriveSyncPanel reconcile={identityReconcile()} open={true} onClose={() => {}} />
        </ToastProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Conectar com Google' }))
      await vi.waitFor(() => expect(screen.queryByText(/Última sincronização/)).not.toBeNull())

      const fetchCallsAfterConnectSync = (fetch as ReturnType<typeof vi.fn>).mock.calls.length

      // Advance well past several 60s intervals: with the polling loop
      // removed, nothing should fire on a timer.
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsAfterConnectSync)
    } finally {
      vi.useRealTimers()
    }
  })
})
