import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/preact'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  it('renders a moon icon in light mode and flips to a sun + dark theme on click', () => {
    render(<ThemeToggle />)

    const button = screen.getByRole('button', { name: 'Alternar tema claro/escuro' })
    expect(button.textContent).toBe('🌙')

    fireEvent.click(button)

    expect(button.textContent).toBe('☀️')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
