import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { DriveConfigPanel } from './DriveConfigPanel'
import type { DriveConfigPanelProps } from './DriveConfigPanel'

// DriveConfigPanel is purely presentational (issue #110): all connection/
// sync state and the actual save/clear/connect/disconnect behavior live in
// `useDriveSync` (see useDriveSync.test.ts). This suite covers only what
// the panel itself owns: rendering from props and wiring its form/buttons
// to the callback props.
function baseProps(overrides: Partial<DriveConfigPanelProps> = {}): DriveConfigPanelProps {
  return {
    open: true,
    onClose: vi.fn(),
    connected: false,
    userName: null,
    busy: false,
    isOnline: true,
    lastSyncedAt: null,
    configured: true,
    storedClientId: 'real-client-id.apps.googleusercontent.com',
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    saveClientId: vi.fn().mockReturnValue(true),
    clearClientId: vi.fn(),
    ...overrides,
  }
}

describe('DriveConfigPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the configuration form when open', () => {
    render(
      <ToastProvider>
        <DriveConfigPanel {...baseProps()} />
      </ToastProvider>,
    )

    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(screen.getByLabelText('Client ID')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Salvar Client ID' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Limpar' })).not.toBeNull()
  })

  it('does not render a dialog when closed', () => {
    const { container } = render(
      <ToastProvider>
        <DriveConfigPanel {...baseProps({ open: false })} />
      </ToastProvider>,
    )

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('submitting the form calls saveClientId with the typed value', () => {
    const saveClientId = vi.fn().mockReturnValue(true)
    render(
      <ToastProvider>
        <DriveConfigPanel {...baseProps({ saveClientId })} />
      </ToastProvider>,
    )

    const input = screen.getByLabelText('Client ID')
    fireEvent.input(input, { target: { value: 'new-id.apps.googleusercontent.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Client ID' }))

    expect(saveClientId).toHaveBeenCalledWith('new-id.apps.googleusercontent.com')
  })

  it('clicking Limpar calls clearClientId and empties the form', () => {
    const clearClientId = vi.fn()
    render(
      <ToastProvider>
        <DriveConfigPanel {...baseProps({ clearClientId })} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))

    expect(clearClientId).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Client ID') as HTMLInputElement).value).toBe('')
  })

  it('shows the configured/not-configured status from the configured prop', () => {
    const { rerender } = render(
      <ToastProvider>
        <DriveConfigPanel {...baseProps({ configured: true })} />
      </ToastProvider>,
    )
    expect(screen.getByText('✅ Configurado')).not.toBeNull()

    rerender(
      <ToastProvider>
        <DriveConfigPanel {...baseProps({ configured: false })} />
      </ToastProvider>,
    )
    expect(screen.getByText('⚠️ Não configurado')).not.toBeNull()
  })

  it('shows connected status, last-synced text, and a working Desconectar button', () => {
    const disconnect = vi.fn()
    render(
      <ToastProvider>
        <DriveConfigPanel
          {...baseProps({
            connected: true,
            userName: 'Test User',
            lastSyncedAt: Date.now() - 5 * 60000,
            disconnect,
          })}
        />
      </ToastProvider>,
    )

    expect(screen.getByText('Conectado como Test User')).not.toBeNull()
    expect(screen.getByText(/Última sincronização/)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }))
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('shows not-connected status and a Conectar button that calls connect() when configured', () => {
    const connect = vi.fn().mockResolvedValue(undefined)
    render(
      <ToastProvider>
        <DriveConfigPanel {...baseProps({ connected: false, configured: true, connect })} />
      </ToastProvider>,
    )

    expect(
      screen.getByText('Conecte sua conta Google para sincronizar seus projetos.'),
    ).not.toBeNull()

    const connectButton = screen.getByRole('button', { name: 'Conectar com Google' })
    expect(connectButton).not.toHaveProperty('disabled', true)

    fireEvent.click(connectButton)
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('disables the Conectar button when not configured', () => {
    render(
      <ToastProvider>
        <DriveConfigPanel {...baseProps({ connected: false, configured: false })} />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: 'Conectar com Google' })).toHaveProperty(
      'disabled',
      true,
    )
  })
})
