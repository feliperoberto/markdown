import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/preact'
import { FullscreenToggle } from './FullscreenToggle'

describe('FullscreenToggle', () => {
  let fullscreenElement: Element | null = null

  beforeEach(() => {
    fullscreenElement = null
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    document.documentElement.requestFullscreen = vi.fn().mockImplementation(() => {
      fullscreenElement = document.documentElement
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    })
  })

  afterEach(() => {
    // @ts-expect-error cleaning up a test-only stub
    delete document.documentElement.requestFullscreen
  })

  it('renders the enter-fullscreen icon and flips to the exit icon once fullscreen', async () => {
    render(<FullscreenToggle />)

    const button = screen.getByRole('button', { name: 'Alternar tela cheia' })
    expect(button.textContent).toBe('⛶')

    fireEvent.click(button)

    expect(await screen.findByText('⛔')).not.toBeNull()
  })
})
