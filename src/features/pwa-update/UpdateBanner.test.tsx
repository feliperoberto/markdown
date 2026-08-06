import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { UpdateBanner } from './UpdateBanner'
import { pwaUpdateCopy } from './copy'

afterEach(() => cleanup())

describe('UpdateBanner', () => {
  it('renders no visible banner box when closed', () => {
    const { container } = render(
      <UpdateBanner open={false} onUpdate={vi.fn()} onDismiss={vi.fn()} />,
    )

    expect(screen.queryByRole('button')).toBeNull()
    // The always-mounted announcer (see below) is present but empty, so
    // there is still no visible text anywhere in the tree.
    expect(container.textContent).toBe('')
  })

  it('renders the title and body copy when open', () => {
    render(<UpdateBanner open onUpdate={vi.fn()} onDismiss={vi.fn()} />)

    // The title text appears twice by design: once in the always-mounted
    // hidden announcer (see the dedicated test below) and once in the
    // visible heading.
    expect(screen.getAllByText(pwaUpdateCopy.bannerTitle)).toHaveLength(2)
    expect(screen.getByText(pwaUpdateCopy.bannerBody)).not.toBeNull()
  })

  it('keeps a persistent, visually-hidden live region across the open/closed transition', () => {
    // Screen readers only reliably announce a MUTATION to an EXISTING
    // aria-live region — a whole new subtree that appears already
    // containing text is not guaranteed to be announced. The announcer
    // must therefore be the SAME DOM node before and after `open` flips,
    // not remounted along with the visible banner box.
    const { container, rerender } = render(
      <UpdateBanner open={false} onUpdate={vi.fn()} onDismiss={vi.fn()} />,
    )
    const announcer = container.querySelector('[role="status"]')
    expect(announcer).not.toBeNull()
    expect(announcer?.getAttribute('aria-live')).toBe('polite')
    expect(announcer?.textContent).toBe('')

    rerender(<UpdateBanner open onUpdate={vi.fn()} onDismiss={vi.fn()} />)

    const sameAnnouncer = container.querySelector('[role="status"]')
    expect(sameAnnouncer).toBe(announcer)
    expect(sameAnnouncer?.textContent).toBe(pwaUpdateCopy.bannerTitle)
  })

  it('calls onUpdate, not onDismiss, when "Atualizar" is clicked', () => {
    const onUpdate = vi.fn()
    const onDismiss = vi.fn()
    render(<UpdateBanner open onUpdate={onUpdate} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: pwaUpdateCopy.updateButtonAriaLabel }))

    expect(onUpdate).toHaveBeenCalledOnce()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('calls onDismiss, not onUpdate, when "Agora não" is clicked', () => {
    const onUpdate = vi.fn()
    const onDismiss = vi.fn()
    render(<UpdateBanner open onUpdate={onUpdate} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: pwaUpdateCopy.dismissButtonLabel }))

    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('exposes a distinct accessible name via aria-label on the update button, containing the visible text (WCAG 2.5.3)', () => {
    render(<UpdateBanner open onUpdate={vi.fn()} onDismiss={vi.fn()} />)
    const updateButton = screen.getByRole('button', { name: pwaUpdateCopy.updateButtonAriaLabel })

    expect(updateButton.textContent).toBe(pwaUpdateCopy.updateButtonLabel)
    expect(updateButton.getAttribute('aria-label')).toBe(pwaUpdateCopy.updateButtonAriaLabel)
    expect(pwaUpdateCopy.updateButtonAriaLabel.toLowerCase()).toContain(
      pwaUpdateCopy.updateButtonLabel.toLowerCase(),
    )
  })

  it('leaves the dismiss button with no aria-label override (its visible text is already unambiguous)', () => {
    render(<UpdateBanner open onUpdate={vi.fn()} onDismiss={vi.fn()} />)
    const dismissButton = screen.getByRole('button', { name: pwaUpdateCopy.dismissButtonLabel })

    expect(dismissButton.hasAttribute('aria-label')).toBe(false)
  })
})
