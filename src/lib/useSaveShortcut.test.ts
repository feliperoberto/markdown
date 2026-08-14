import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/preact'
import { useSaveShortcut } from './useSaveShortcut'

function keydown(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  document.dispatchEvent(event)
  return event
}

describe('useSaveShortcut', () => {
  afterEach(() => {
    // vitest.config.ts sets globals:false, which disables
    // @testing-library/preact's automatic afterEach cleanup — without this,
    // every renderHook() below stays mounted and its document keydown
    // listener leaks into every subsequent test in this file.
    cleanup()
    document.querySelectorAll('[role="dialog"]').forEach((el) => el.remove())
  })

  it('fires onSave on Ctrl+S', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave))

    act(() => {
      keydown({ key: 's', ctrlKey: true })
    })

    expect(onSave).toHaveBeenCalledOnce()
  })

  it('fires onSave on Cmd+S (metaKey)', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave))

    act(() => {
      keydown({ key: 's', metaKey: true })
    })

    expect(onSave).toHaveBeenCalledOnce()
  })

  it('prevents the browser default (native Save dialog) once the chord matches', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave))

    let event: KeyboardEvent
    act(() => {
      event = keydown({ key: 's', ctrlKey: true })
    })

    expect(event!.defaultPrevented).toBe(true)
  })

  it('does not fire on plain "s" with no modifier', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave))

    act(() => {
      keydown({ key: 's' })
    })

    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not fire on Ctrl+Shift+S (leaves "Save As" alone)', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave))

    act(() => {
      keydown({ key: 's', ctrlKey: true, shiftKey: true })
    })

    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not fire on Ctrl+Alt+S', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave))

    act(() => {
      keydown({ key: 's', ctrlKey: true, altKey: true })
    })

    expect(onSave).not.toHaveBeenCalled()
  })

  it('ignores an OS-repeated keydown from a held-down chord', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave))

    act(() => {
      keydown({ key: 's', ctrlKey: true, repeat: true })
    })

    expect(onSave).not.toHaveBeenCalled()
  })

  it('ignores the chord while an IME composition is in progress', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave))

    act(() => {
      keydown({ key: 's', ctrlKey: true, isComposing: true })
    })

    expect(onSave).not.toHaveBeenCalled()
  })

  // Regression test: an earlier version skipped onSave whenever ANY
  // [role="dialog"] was open, mirroring app.tsx's sidebar-dismissal guard.
  // That silently broke the shortcut's own destination UI — the Drive sync
  // panel is itself a dialog, so once connected with that modal still open,
  // every subsequent Ctrl+S did nothing. There is nothing dialog-specific
  // to guard here: firing the sync callback while some unrelated dialog
  // happens to be open is harmless.
  it('still fires onSave (and prevents default) even while a dialog is open', () => {
    const onSave = vi.fn()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)

    try {
      renderHook(() => useSaveShortcut(onSave))

      let event: KeyboardEvent
      act(() => {
        event = keydown({ key: 's', ctrlKey: true })
      })

      expect(event!.defaultPrevented).toBe(true)
      expect(onSave).toHaveBeenCalledOnce()
    } finally {
      dialog.remove()
    }
  })

  it('always uses the latest onSave without tearing down the listener on identity churn', () => {
    const calls: string[] = []
    const { rerender } = renderHook(({ label }) => useSaveShortcut(() => calls.push(label)), {
      initialProps: { label: 'first' },
    })

    rerender({ label: 'second' })
    act(() => {
      keydown({ key: 's', ctrlKey: true })
    })

    expect(calls).toEqual(['second'])
  })

  it('removes the listener on unmount', () => {
    const onSave = vi.fn()
    const { unmount } = renderHook(() => useSaveShortcut(onSave))

    unmount()
    act(() => {
      keydown({ key: 's', ctrlKey: true })
    })

    expect(onSave).not.toHaveBeenCalled()
  })
})
