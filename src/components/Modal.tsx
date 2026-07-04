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
        onClose()
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
  }, [open, onClose, initialFocusRef])

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      class={`${styles.overlay} ${open ? styles.overlayVisible : ''}`}
      aria-hidden={!open}
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
            <button type="button" class={styles.closeButton} aria-label={closeLabel} onClick={onClose}>
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
