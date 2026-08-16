import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { DriveSyncPanel } from './DriveSyncPanel'
import type { DriveSyncPanelProps } from './DriveSyncPanel'

// DriveSyncPanel is purely presentational (issue #110): all connection/
// sync state and the Connect/Disconnect/save-Client-ID actions live in
// `useDriveSync` (see useDriveSync.test.ts) and `DriveConfigPanel`
// (DriveConfigPanel.test.tsx). This suite covers only what the panel
// itself owns: rendering from props, wiring the Sync button to the `sync`
// prop, and the Ctrl+S/Cmd+S `actionSignal` effect.
function baseProps(overrides: Partial<DriveSyncPanelProps> = {}): DriveSyncPanelProps {
  return {
    connected: false,
    userName: null,
    busy: false,
    isOnline: true,
    lastSyncedAt: null,
    configured: true,
    sync: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    open: true,
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('DriveSyncPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows disconnected guidance when not connected', () => {
    render(
      <ToastProvider>
        <DriveSyncPanel {...baseProps()} />
      </ToastProvider>,
    )

    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(screen.queryByText(/Conectado como/)).toBeNull()
    expect(
      screen.getByText(
        'Use o botão de configurações (⚙️) na barra lateral para conectar sua conta Google Drive.',
      ),
    ).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Sincronizar' })).toBeNull()
  })

  it('shows connected status and a working Sincronizar button', async () => {
    const sync = vi.fn().mockResolvedValue(undefined)
    render(
      <ToastProvider>
        <DriveSyncPanel {...baseProps({ connected: true, userName: 'Test User', sync })} />
      </ToastProvider>,
    )

    expect(screen.getByText('Conectado como Test User')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar' }))
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
  })

  it('the Desconectar button calls the disconnect prop', () => {
    const disconnect = vi.fn()
    render(
      <ToastProvider>
        <DriveSyncPanel {...baseProps({ connected: true, userName: 'Test User', disconnect })} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }))
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('clicking the header cloud button calls onClickCloudButton', () => {
    const onClickCloudButton = vi.fn()
    render(
      <ToastProvider>
        <DriveSyncPanel {...baseProps({ onClickCloudButton })} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar com Google Drive' }))
    expect(onClickCloudButton).toHaveBeenCalledTimes(1)
  })

  // Ctrl+S/Cmd+S (useSaveShortcut, wired in src/app/app.tsx) bumps
  // `actionSignal` (action: 'sync') instead of calling anything on this
  // component directly — this is the receiving end of that signal.
  describe('actionSignal: sync (Ctrl+S/Cmd+S)', () => {
    it('calls sync() when bumped while connected and configured', async () => {
      const sync = vi.fn().mockResolvedValue(undefined)
      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel {...baseProps({ connected: true, sync })} />
        </ToastProvider>,
      )

      rerender(
        <ToastProvider>
          <DriveSyncPanel
            {...baseProps({ connected: true, sync, actionSignal: { action: 'sync', nonce: 1 } })}
          />
        </ToastProvider>,
      )

      await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    })

    it('shows a warning toast and requests config instead of syncing when not connected', async () => {
      const sync = vi.fn().mockResolvedValue(undefined)
      const onRequestConfig = vi.fn()
      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel {...baseProps({ connected: false, sync, onRequestConfig })} />
        </ToastProvider>,
      )

      rerender(
        <ToastProvider>
          <DriveSyncPanel
            {...baseProps({
              connected: false,
              sync,
              onRequestConfig,
              actionSignal: { action: 'sync', nonce: 1 },
            })}
          />
        </ToastProvider>,
      )

      await waitFor(() =>
        expect(screen.getByText('Conecte o Google Drive para sincronizar')).not.toBeNull(),
      )
      expect(onRequestConfig).toHaveBeenCalledTimes(1)
      expect(sync).not.toHaveBeenCalled()
    })

    it('shows a warning toast and requests config when connected but not configured', async () => {
      const sync = vi.fn().mockResolvedValue(undefined)
      const onRequestConfig = vi.fn()
      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel
            {...baseProps({ connected: true, configured: false, sync, onRequestConfig })}
          />
        </ToastProvider>,
      )

      rerender(
        <ToastProvider>
          <DriveSyncPanel
            {...baseProps({
              connected: true,
              configured: false,
              sync,
              onRequestConfig,
              actionSignal: { action: 'sync', nonce: 1 },
            })}
          />
        </ToastProvider>,
      )

      await waitFor(() => expect(onRequestConfig).toHaveBeenCalledTimes(1))
      expect(sync).not.toHaveBeenCalled()
    })

    // Two same-action requests in a row must each be observed — `nonce`
    // (not just `action` changing) is what actually triggers the effect.
    it('two separate nonces each call sync() once', async () => {
      const sync = vi.fn().mockResolvedValue(undefined)
      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel
            {...baseProps({ connected: true, sync, actionSignal: { action: 'sync', nonce: 1 } })}
          />
        </ToastProvider>,
      )
      await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))

      rerender(
        <ToastProvider>
          <DriveSyncPanel
            {...baseProps({ connected: true, sync, actionSignal: { action: 'sync', nonce: 2 } })}
          />
        </ToastProvider>,
      )

      await waitFor(() => expect(sync).toHaveBeenCalledTimes(2))
    })
  })
})
