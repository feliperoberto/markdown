import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { DriveSyncPanel } from './DriveSyncPanel'

// Never hit real Google endpoints in tests: `google-identity.ts`'s GIS
// script loader is mocked entirely, and the OAuth token client it exposes
// resolves synchronously with a fake token instead of any real
// popup/redirect flow.
vi.mock('./google-identity', () => ({
  loadGoogleIdentity: vi.fn().mockResolvedValue({
    accounts: {
      oauth2: {
        initTokenClient: (config: { callback: (response: { access_token: string; expires_in: number }) => void }) => ({
          requestAccessToken: () => config.callback({ access_token: 'fake-token', expires_in: 3600 }),
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

  it('connecting to Drive moves the panel from disconnected to connected sync state', async () => {
    render(
      <ToastProvider>
        <DriveSyncPanel getSnapshot={() => ({ projects: {} })} onImported={vi.fn()} />
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
})
