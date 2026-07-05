import { createContext } from 'preact'
import type { ComponentChildren } from 'preact'
import { useCallback, useContext, useRef, useState } from 'preact/hooks'
import styles from './Toast.module.css'

export type ToastVariant = 'success' | 'error' | 'warning'

const DURATION_BY_VARIANT: Record<ToastVariant, number> = {
  success: 2000,
  warning: 4000,
  error: 6000,
}

const EXIT_ANIMATION_MS = 300
const DEDUPE_WINDOW_MS = 500

interface ToastRecord {
  id: number
  message: string
  variant: ToastVariant
  visible: boolean
}

export type ShowToast = (message: string, variant?: ToastVariant) => void

const ToastContext = createContext<ShowToast | null>(null)

/** Hook replacement for the global `showToast()` in prototype/index.html. */
export function useToast(): ShowToast {
  const showToast = useContext(ToastContext)
  if (!showToast) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return showToast
}

export interface ToastProviderProps {
  children: ComponentChildren
}

/**
 * Renders the toast stack and exposes `showToast` via context to
 * descendants (through `useToast()`). See
 * src/components/README.md#3-toast.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const nextId = useRef(0)
  const lastShownRef = useRef<{ message: string; timestamp: number } | null>(null)

  const dismiss = useCallback((id: number) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, visible: false } : toast)),
    )
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, EXIT_ANIMATION_MS)
  }, [])

  const showToast = useCallback<ShowToast>(
    (message, variant = 'success') => {
      const now = Date.now()
      const lastShown = lastShownRef.current
      if (
        lastShown &&
        lastShown.message === message &&
        now - lastShown.timestamp < DEDUPE_WINDOW_MS
      ) {
        return
      }
      lastShownRef.current = { message, timestamp: now }

      const id = nextId.current++
      setToasts((current) => [...current, { id, message, variant, visible: false }])
      // Flip to visible on next frame so the enter transition runs.
      requestAnimationFrame(() => {
        setToasts((current) =>
          current.map((toast) => (toast.id === id ? { ...toast, visible: true } : toast)),
        )
      })
      setTimeout(() => dismiss(id), DURATION_BY_VARIANT[variant])
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div class={styles.host}>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            message={toast.message}
            variant={toast.variant}
            visible={toast.visible}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

interface ToastItemProps {
  message: string
  variant: ToastVariant
  visible: boolean
}

function ToastItem({ message, variant, visible }: ToastItemProps) {
  const role = variant === 'error' ? 'alert' : 'status'
  const ariaLive = variant === 'error' ? 'assertive' : 'polite'

  return (
    <div
      class={`${styles.toast} ${styles[variant]} ${visible ? styles.toastVisible : ''}`}
      role={role}
      aria-live={ariaLive}
    >
      {message}
    </div>
  )
}

// Re-exported so consumers writing tests/stories can render a single toast
// outside the provider stack if needed, without duplicating the role logic.
export interface ToastProps {
  message: string
  variant?: ToastVariant
}

export function Toast({ message, variant = 'success' }: ToastProps) {
  return <ToastItem message={message} variant={variant} visible />
}
