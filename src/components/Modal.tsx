import { useEffect, useRef } from 'preact/hooks'
import type { ComponentChildren, RefObject } from 'preact'
import styles from './Modal.module.css'
import { getFocusableElements, isTopmostModal, popModal, pushModal } from './modal-stack'

export interface ModalProps {
  open: boolean
  onClose: () => void
  titleId: string
  title: ComponentChildren
  children: ComponentChildren
  footer?: ComponentChildren
  closeLabel?: string
  initialFocusRef?: RefObject<HTMLElement>
}

/**
 * Base modal primitive. Ports the focus-trap/stacking behavior of
 * `prototype/components/dialog-utils.js` (`trapFocus`/`openModal`/
 * `closeModal`/`_openModalStack`) to Preact effects.
 *
 * See src/components/README.md#2-modal.
 */
export function Modal({
  open,
  onClose,
  titleId,
  title,
  children,
  footer,
  closeLabel = 'Fechar',
  initialFocusRef,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const stackIdRef = useRef<symbol>(Symbol('modal'))
  const lastFocusedRef = useRef<Element | null>(null)

  // Dereferenced fresh inside the effect instead of listed as a dependency
  // (issue: callers like dialogs.tsx pass an inline `onClose={() =>
  // close(null)}`, which gets a new identity on every render — every
  // keystroke in a dialog's <input> re-renders the component, which
  // re-triggered this whole effect, tearing down and re-running the
  // focus-trap setup and re-focusing `focusable[0]` mid-keystroke, yanking
  // focus out of the input the user was actively typing into).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const modalEl = modalRef.current
    if (!modalEl) return

    const stackId = stackIdRef.current
    lastFocusedRef.current = document.activeElement
    pushModal(stackId)

    const focusable = getFocusableElements(modalEl)
    const initialTarget = initialFocusRef?.current ?? focusable[0] ?? modalEl
    initialTarget.focus()

    function handleKeydown(event: KeyboardEvent) {
      if (!modalEl) return

      if (event.key === 'Escape') {
        if (!isTopmostModal(stackId)) return
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusableEls = getFocusableElements(modalEl)
      if (focusableEls.length === 0) return

      const first = focusableEls[0]
      const last = focusableEls[focusableEls.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeydown)

    return () => {
      document.removeEventListener('keydown', handleKeydown)
      popModal(stackId)
      const lastFocused = lastFocusedRef.current
      if (lastFocused instanceof HTMLElement) {
        lastFocused.focus()
      }
      lastFocusedRef.current = null
    }
  }, [open, initialFocusRef])

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      class={`${styles.overlay} ${open ? styles.overlayVisible : ''}`}
      aria-hidden={!open}
      role="presentation"
      onClick={handleOverlayClick}
    >
      {open && (
        <div
          ref={modalRef}
          class={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <div class={styles.header}>
            <div id={titleId} class={styles.title}>
              {title}
            </div>
            <button
              type="button"
              class={styles.closeButton}
              aria-label={closeLabel}
              onClick={onClose}
            >
              ✕
            </button>
          </div>
          <div>{children}</div>
          {footer && <div class={styles.footer}>{footer}</div>}
        </div>
      )}
    </div>
  )
}
