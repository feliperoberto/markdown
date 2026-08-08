import { useEffect, useId, useRef, useState } from 'preact/hooks'
import { useOutsideClick } from './useOutsideClick'

export interface DropdownMenuControls {
  /** Pass as the trigger button's `id` (and `aria-controls` target on the menu). */
  triggerId: string
  /** Pass as the menu container's own `id` (and the trigger's `aria-controls`). */
  menuId: string
  /** Attach to the menu's root element so outside-click and keyboard nav can find it. */
  menuRef: { current: HTMLDivElement | null }
  /** Anchored just below-left of the trigger, clamped to the viewport's left edge. */
  menuPosition: { top: number; left: number }
  /** Wire to the trigger button's `onClick`. */
  toggleMenu: (e: MouseEvent) => void
}

/**
 * Shared machinery behind every "..." actions menu in the sidebar (project
 * rows, and file rows since the swipe/hover-revealed row actions were
 * replaced with the same menu pattern): trigger-anchored positioning,
 * keyboard nav (focus the first item on open, Up/Down cycles, Escape/Tab
 * closes and returns focus to the trigger), and outside-click dismissal.
 * Extracted from ProjectGroup (the original "..." menu) so a second menu
 * doesn't reimplement this from scratch with its own copy of the same bugs
 * to fix twice.
 *
 * Open/close state itself is NOT owned here — it's lifted to a single slot
 * in ProjectsSidebar so at most one menu (project or file) is open across
 * the whole sidebar at once. `onOpen`/`onClose` are cached in refs (not
 * effect dependencies), the same pattern as useOutsideClick and Modal's
 * `onCloseRef`, so passing fresh inline closures every render — the normal
 * case, since callers bind them to a specific project/file name — doesn't
 * tear down and re-attach the keydown listener (which would re-focus the
 * first menu item) on every unrelated re-render while the menu is open.
 */
export function useDropdownMenu(
  isOpen: boolean,
  onOpen: () => void,
  onClose: () => void,
): DropdownMenuControls {
  const reactId = useId()
  const triggerId = `dropdown-trigger-${reactId}`
  const menuId = `dropdown-menu-${reactId}`
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })

  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Computes the dropdown's position from the trigger button's own bounding
  // box: anchored just below-left of the trigger, clamped to the viewport's
  // left edge. Matches the prototype's showProjectMenu() math.
  function toggleMenu(e: MouseEvent) {
    e.stopPropagation()
    if (isOpen) {
      onCloseRef.current()
      return
    }
    const buttonEl = document.getElementById(triggerId)
    const rect = buttonEl?.getBoundingClientRect()
    if (rect) {
      setMenuPosition({ top: rect.bottom + 4, left: Math.max(4, rect.left - 180) })
    }
    onOpenRef.current()
  }

  // Keyboard-navigable dropdown: focus-on-open, arrow-key cycling,
  // Escape/Tab close with focus returned to the trigger.
  useEffect(() => {
    if (!isOpen) return

    const menuEl = menuRef.current
    if (!menuEl) return

    const items = Array.from(menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    items[0]?.focus()

    function closeAndReturnFocus() {
      onCloseRef.current()
      document.getElementById(triggerId)?.focus()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAndReturnFocus()
        return
      }
      if (e.key === 'Tab') {
        closeAndReturnFocus()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()

      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const next = (current + delta + items.length) % items.length
      items[next]?.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, triggerId])

  // Closes on any click/tap outside the menu and its trigger — losing focus
  // to another menu's trigger, a different row, the editor, or anywhere
  // else on the page should dismiss this menu rather than leaving it
  // floating open.
  useOutsideClick(
    isOpen,
    (target) => {
      if (menuRef.current?.contains(target)) return true
      return Boolean(document.getElementById(triggerId)?.contains(target))
    },
    onClose,
  )

  return { triggerId, menuId, menuRef, menuPosition, toggleMenu }
}
