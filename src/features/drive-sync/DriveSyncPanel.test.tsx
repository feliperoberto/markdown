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
        <DriveSyncPanel reconcile={identityReconcile()} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sincronização com Google Drive' }))

    expect(screen.getByRole('button', { name: 'Conectar com Google' })).not.toBeNull()
    expect(screen.queryByText(/Conectado como/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Conectar com Google' }))

    await waitFor(() => expect(screen.queryByText('Conectado como Test User')).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Desconectar' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Conectar com Google' })).toBeNull()
  })

  // Regression test: handleSaveClientId previously saved an empty/
  // whitespace Client ID and showed a SUCCESS toast, leaving Connect
  // silently disabled with no explanation. The prototype rejected it.
  it('rejects an empty Client ID with a warning instead of saving it', async () => {
    render(
      <ToastProvider>
        <DriveSyncPanel reconcile={identityReconcile()} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sincronização com Google Drive' }))
    const input = screen.getByLabelText('Client ID')
    fireEvent.input(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Client ID' }))

    await waitFor(() => expect(screen.getByText('Client ID não pode estar vazio')).not.toBeNull())

    // The already-configured Client ID from beforeEach must be untouched —
    // Connect stays enabled, not silently broken by an empty save.
    expect(screen.getByRole('button', { name: 'Conectar com Google' })).not.toHaveProperty(
      'disabled',
      true,
    )
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
        <DriveSyncPanel reconcile={reconcile} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sincronização com Google Drive' }))
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

  // Regression test for issue #92: connecting must NOT start a background
  // polling loop (the loop's periodic token re-request popped a Google
  // auth window that stole editor focus). After the one connect-time sync
  // settles, no further network calls should happen on a timer.
  it('does not start a background auto-sync polling loop after connecting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(
        <ToastProvider>
          <DriveSyncPanel reconcile={identityReconcile()} />
        </ToastProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Sincronização com Google Drive' }))
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
