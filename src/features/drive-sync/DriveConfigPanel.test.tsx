import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { DriveConfigPanel } from './DriveConfigPanel'

describe('DriveConfigPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    // A real (non-placeholder) Client ID must already be configured
    localStorage.setItem('driveClientId', 'real-client-id.apps.googleusercontent.com')
  })

  afterEach(() => {
    cleanup()
  })

  it('renders with configuration form when open', async () => {
    render(
      <ToastProvider>
        <DriveConfigPanel
          open={true}
          onClose={() => {}}
          connectionStatus="disconnected"
          userName={null}
          lastSyncedAt={null}
        />
      </ToastProvider>,
    )

    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(screen.getByLabelText('Client ID')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Salvar Client ID' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Limpar' })).not.toBeNull()
  })

  it('does not render when closed', () => {
    const { container } = render(
      <ToastProvider>
        <DriveConfigPanel
          open={false}
          onClose={() => {}}
          connectionStatus="disconnected"
          userName={null}
          lastSyncedAt={null}
        />
      </ToastProvider>,
    )

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('rejects an empty Client ID with a warning', async () => {
    render(
      <ToastProvider>
        <DriveConfigPanel
          open={true}
          onClose={() => {}}
          connectionStatus="disconnected"
          userName={null}
          lastSyncedAt={null}
        />
      </ToastProvider>,
    )

    const input = screen.getByLabelText('Client ID')
    fireEvent.input(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Client ID' }))

    await waitFor(() => expect(screen.getByText('Client ID não pode estar vazio')).not.toBeNull())
  })

  it('accepts a valid Client ID and shows success toast', async () => {
    render(
      <ToastProvider>
        <DriveConfigPanel
          open={true}
          onClose={() => {}}
          connectionStatus="disconnected"
          userName={null}
          lastSyncedAt={null}
        />
      </ToastProvider>,
    )

    const input = screen.getByLabelText('Client ID')
    fireEvent.input(input, { target: { value: 'new-id.apps.googleusercontent.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Client ID' }))

    await waitFor(() => expect(screen.getByText('✅ Configuração salva')).not.toBeNull())
    expect(localStorage.getItem('driveClientId')).toBe('new-id.apps.googleusercontent.com')
  })

  it('shows connection status when connected', () => {
    render(
      <ToastProvider>
        <DriveConfigPanel
          open={true}
          onClose={() => {}}
          connectionStatus="connected"
          userName="Test User"
          lastSyncedAt={Date.now() - 5 * 60000} // 5 minutes ago
        />
      </ToastProvider>,
    )

    expect(screen.getByText('Conectado como Test User')).not.toBeNull()
    expect(screen.getByText(/Última sincronização/)).not.toBeNull()
  })

  it('shows not connected status when disconnected', () => {
    render(
      <ToastProvider>
        <DriveConfigPanel
          open={true}
          onClose={() => {}}
          connectionStatus="disconnected"
          userName={null}
          lastSyncedAt={null}
        />
      </ToastProvider>,
    )

    expect(
      screen.getByText('Conecte sua conta Google para sincronizar seus projetos.'),
    ).not.toBeNull()
  })
})
