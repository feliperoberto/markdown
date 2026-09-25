import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { PdfExportButton } from './PdfExportButton'

// Same `matchMedia` stub as FullscreenToggle.test.tsx: jsdom doesn't
// understand `display-mode`, so it's stubbed to control isRunningStandalone().
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

function mockUserAgent(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
}

const LABEL = 'Exportar PDF do arquivo atual'

describe('PdfExportButton', () => {
  beforeEach(() => {
    mockStandalone(false)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the compact print icon button and calls onPrint on click', () => {
    const onPrint = vi.fn()
    render(<PdfExportButton onPrint={onPrint} />)

    const button = screen.getByRole('button', { name: LABEL })
    expect(button.textContent).toBe('🖨️')
    expect(button.getAttribute('title')).toBe('Exportar PDF (via impressão)')
    expect(button.classList.contains('toolbar-pdf-btn')).toBe(true)

    fireEvent.click(button)
    expect(onPrint).toHaveBeenCalledOnce()
  })

  it('is disabled when asked', () => {
    render(<PdfExportButton onPrint={vi.fn()} disabled />)

    const button = screen.getByRole('button', { name: LABEL }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('renders nothing on iOS when running standalone', () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    mockStandalone(true)

    render(<PdfExportButton onPrint={vi.fn()} />)

    expect(screen.queryByRole('button', { name: LABEL })).toBeNull()
  })

  it('still renders on iOS Safari (not standalone) and on standalone non-iOS', () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    const { unmount } = render(<PdfExportButton onPrint={vi.fn()} />)
    expect(screen.getByRole('button', { name: LABEL })).not.toBeNull()
    unmount()

    vi.restoreAllMocks()
    mockStandalone(true)
    render(<PdfExportButton onPrint={vi.fn()} />)
    expect(screen.getByRole('button', { name: LABEL })).not.toBeNull()
  })
})
