import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { FullscreenToggle } from './FullscreenToggle'

// Matches the `mockPrefersDark` pattern in src/features/theme/useTheme.test.ts:
// jsdom's real `matchMedia` doesn't understand `display-mode`, so it's stubbed
// per-query here to control `isRunningStandalone()`'s result deterministically.
function mockStandalone(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)' && matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe('FullscreenToggle', () => {
  let fullscreenElement: Element | null = null

  beforeEach(() => {
    fullscreenElement = null
    mockStandalone(false)
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
    cleanup()
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

  it('renders nothing when the app is running standalone', () => {
    mockStandalone(true)

    render(<FullscreenToggle />)

    expect(screen.queryByRole('button', { name: 'Alternar tela cheia' })).toBeNull()
  })
})
