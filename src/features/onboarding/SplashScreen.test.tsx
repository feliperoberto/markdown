import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { SplashScreen } from './SplashScreen'
import { ToastProvider } from '@/components'

// SplashScreen now renders <PwaInstallPrompt /> (a second install-button
// entry point), which internally calls useToast() via useInstallPrompt() —
// so the harness needs a ToastProvider ancestor, same requirement as
// every other component that composes PwaInstallPrompt.
function renderSplashScreen() {
  return render(
    <ToastProvider>
      <SplashScreen />
    </ToastProvider>,
  )
}

describe('SplashScreen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the brand/title/subtitle on first load', () => {
    renderSplashScreen()

    expect(screen.getByText('Marcar para Existir')).not.toBeNull()
    expect(screen.getByText('Editor de Markdown')).not.toBeNull()
    expect(screen.getByText('Você marca com a mão. A máquina lê a estrutura.')).not.toBeNull()
  })

  it('renders nothing once the user has permanently dismissed it', () => {
    localStorage.setItem('splashDismissed', 'true')

    const { container } = renderSplashScreen()

    expect(container.querySelector('.splash-screen')).toBeNull()
  })

  it('clicking "Começar a marcar" dismisses it without checking the box', () => {
    const { container } = renderSplashScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Começar a marcar' }))

    expect(container.querySelector('.splash-screen')).toBeNull()
    expect(localStorage.getItem('splashDismissed')).toBeNull()
  })

  it('checking "Não mostrar de novo" before dismissing persists the choice', () => {
    const { container } = renderSplashScreen()

    fireEvent.click(screen.getByLabelText('Não mostrar de novo'))
    fireEvent.click(screen.getByRole('button', { name: 'Começar a marcar' }))

    expect(container.querySelector('.splash-screen')).toBeNull()
    expect(localStorage.getItem('splashDismissed')).toBe('true')
  })
})
