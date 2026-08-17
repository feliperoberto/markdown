import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { DriveSyncPanel } from './DriveSyncPanel'
import type { DriveSyncPanelProps } from './DriveSyncPanel'

// DriveSyncPanel is a header icon + keyboard shortcut handler (issue #110).
// This suite covers: rendering the cloud icon, handling the Ctrl+S/Cmd+S
// `actionSignal` effect, and wiring the `onClickCloudButton` callback.
// All other connection/sync state and actions live in `useDriveSync`
// (see useDriveSync.test.ts) and `DriveConfigPanel` (DriveConfigPanel.test.tsx).
function baseProps(overrides: Partial<DriveSyncPanelProps> = {}): DriveSyncPanelProps {
  return {
    needsConfig: false,
    isOnline: true,
    sync: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('DriveSyncPanel', () => {
  afterEach(() => {
    cleanup()
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
  // `needsConfig` is a single derived value from `useDriveSync` (see its
  // doc comment) covering both "not connected" and "connected but not
  // configured" — the component itself no longer distinguishes them.
  describe('actionSignal: sync (Ctrl+S/Cmd+S)', () => {
    it('calls sync() when bumped while needsConfig is false', async () => {
      const sync = vi.fn().mockResolvedValue(undefined)
      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel {...baseProps({ sync })} />
        </ToastProvider>,
      )

      rerender(
        <ToastProvider>
          <DriveSyncPanel {...baseProps({ sync, actionSignal: { action: 'sync', nonce: 1 } })} />
        </ToastProvider>,
      )

      await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    })

    it('shows a warning toast and requests config instead of syncing when needsConfig is true', async () => {
      const sync = vi.fn().mockResolvedValue(undefined)
      const onRequestConfig = vi.fn()
      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel {...baseProps({ needsConfig: true, sync, onRequestConfig })} />
        </ToastProvider>,
      )

      rerender(
        <ToastProvider>
          <DriveSyncPanel
            {...baseProps({
              needsConfig: true,
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

    // Two same-action requests in a row must each be observed — `nonce`
    // (not just `action` changing) is what actually triggers the effect.
    it('two separate nonces each call sync() once', async () => {
      const sync = vi.fn().mockResolvedValue(undefined)
      const { rerender } = render(
        <ToastProvider>
          <DriveSyncPanel {...baseProps({ sync, actionSignal: { action: 'sync', nonce: 1 } })} />
        </ToastProvider>,
      )
      await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))

      rerender(
        <ToastProvider>
          <DriveSyncPanel {...baseProps({ sync, actionSignal: { action: 'sync', nonce: 2 } })} />
        </ToastProvider>,
      )

      await waitFor(() => expect(sync).toHaveBeenCalledTimes(2))
    })
  })
})
