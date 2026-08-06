import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { UpdateBanner } from './UpdateBanner'
import { pwaUpdateCopy } from './copy'

afterEach(() => cleanup())

describe('UpdateBanner', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <UpdateBanner open={false} onUpdate={vi.fn()} onDismiss={vi.fn()} />,
    )

    expect(container.textContent).toBe('')
  })

  it('renders the title and body copy when open', () => {
    render(<UpdateBanner open onUpdate={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByText(pwaUpdateCopy.bannerTitle)).not.toBeNull()
    expect(screen.getByText(pwaUpdateCopy.bannerBody)).not.toBeNull()
  })

  it('announces itself politely, not assertively', () => {
    const { container } = render(<UpdateBanner open onUpdate={vi.fn()} onDismiss={vi.fn()} />)
    const region = container.querySelector('[role="status"]')

    expect(region).not.toBeNull()
    expect(region?.getAttribute('aria-live')).toBe('polite')
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

    fireEvent.click(screen.getByRole('button', { name: pwaUpdateCopy.dismissButtonAriaLabel }))

    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('exposes a distinct accessible name via aria-label, alongside the shorter visible text', () => {
    render(<UpdateBanner open onUpdate={vi.fn()} onDismiss={vi.fn()} />)
    const updateButton = screen.getByRole('button', { name: pwaUpdateCopy.updateButtonAriaLabel })

    expect(updateButton.textContent).toBe(pwaUpdateCopy.updateButtonLabel)
    expect(updateButton.getAttribute('aria-label')).toBe(pwaUpdateCopy.updateButtonAriaLabel)
  })
})
