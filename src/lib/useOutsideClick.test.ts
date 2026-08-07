import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/preact'
import { useOutsideClick } from './useOutsideClick'

function click(target: Node) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('useOutsideClick', () => {
  it('does not fire onOutside while inactive, even on an outside click', () => {
    const onOutside = vi.fn()
    renderHook(() => useOutsideClick(false, () => false, onOutside))

    act(() => click(document.body))

    expect(onOutside).not.toHaveBeenCalled()
  })

  it('fires onOutside when a click target is not inside', () => {
    const onOutside = vi.fn()
    renderHook(() => useOutsideClick(true, () => false, onOutside))

    act(() => click(document.body))

    expect(onOutside).toHaveBeenCalledOnce()
  })

  it('does not fire onOutside when isInside returns true', () => {
    const onOutside = vi.fn()
    renderHook(() => useOutsideClick(true, () => true, onOutside))

    act(() => click(document.body))

    expect(onOutside).not.toHaveBeenCalled()
  })

  it('starts listening when active flips false -> true, and stops on true -> false', () => {
    const onOutside = vi.fn()
    const { rerender } = renderHook(
      ({ active }) => useOutsideClick(active, () => false, onOutside),
      {
        initialProps: { active: false },
      },
    )

    act(() => click(document.body))
    expect(onOutside).not.toHaveBeenCalled()

    rerender({ active: true })
    act(() => click(document.body))
    expect(onOutside).toHaveBeenCalledOnce()

    rerender({ active: false })
    act(() => click(document.body))
    expect(onOutside).toHaveBeenCalledOnce()
  })

  it('always uses the latest isInside/onOutside without tearing down the listener on identity churn', () => {
    const outsideCalls: string[] = []
    const { rerender } = renderHook(
      ({ label }) =>
        useOutsideClick(
          true,
          () => false,
          () => outsideCalls.push(label),
        ),
      { initialProps: { label: 'first' } },
    )

    rerender({ label: 'second' })
    act(() => click(document.body))

    expect(outsideCalls).toEqual(['second'])
  })

  it('removes the listener on unmount', () => {
    const onOutside = vi.fn()
    const { unmount } = renderHook(() => useOutsideClick(true, () => false, onOutside))

    unmount()
    expect(() => act(() => click(document.body))).not.toThrow()
    expect(onOutside).not.toHaveBeenCalled()
  })

  it('ignores clicks the isInside predicate accepts, using a real DOM subtree', () => {
    const onOutside = vi.fn()
    const inside = document.createElement('div')
    const trigger = document.createElement('button')
    inside.appendChild(trigger)
    const outside = document.createElement('div')
    document.body.appendChild(inside)
    document.body.appendChild(outside)

    try {
      renderHook(() => useOutsideClick(true, (target) => inside.contains(target), onOutside))

      act(() => click(trigger))
      expect(onOutside).not.toHaveBeenCalled()

      act(() => click(outside))
      expect(onOutside).toHaveBeenCalledOnce()
    } finally {
      inside.remove()
      outside.remove()
    }
  })

  it('still fires onOutside for a click on a target that stops its own propagation', () => {
    // Regression test: other controls in the app (a file row's select
    // checkbox, its rename/delete buttons, sidebar footer buttons) call
    // event.stopPropagation() in their own click handler so their click
    // doesn't also bubble into a parent row's onClick. A bubble-phase
    // document listener would never see those clicks — the outside-click
    // hook must run in the capture phase so a stopPropagation() elsewhere
    // in the app can't silently defeat dismissal.
    const onOutside = vi.fn()
    const outsideStopper = document.createElement('button')
    outsideStopper.addEventListener('click', (e) => e.stopPropagation())
    document.body.appendChild(outsideStopper)

    try {
      renderHook(() => useOutsideClick(true, () => false, onOutside))

      act(() => click(outsideStopper))

      expect(onOutside).toHaveBeenCalledOnce()
    } finally {
      outsideStopper.remove()
    }
  })
})
