import type { ComponentChildren, JSX } from 'preact'
import styles from './Button.module.css'

export type ButtonVariant = 'default' | 'primary' | 'danger'

export interface ButtonProps {
  variant?: ButtonVariant
  disabled?: boolean
  onClick?: (event: MouseEvent) => void
  children: ComponentChildren
  type?: 'button' | 'submit' | 'reset'
  ariaHasPopup?: JSX.AriaAttributes['aria-haspopup']
  /** Overrides the implicit `button` role — e.g. `menuitem` inside a `role="menu"` container. */
  role?: JSX.HTMLAttributes<HTMLButtonElement>['role']
}

/**
 * Labeled action button (e.g. dialog "Salvar"/"Cancelar", destructive
 * confirms). See src/components/README.md#1-buttoniconbutton.
 */
export function Button({
  variant = 'default',
  disabled = false,
  onClick,
  children,
  type = 'button',
  ariaHasPopup,
  role,
}: ButtonProps) {
  const variantClass =
    variant === 'primary' ? styles.primary : variant === 'danger' ? styles.danger : styles.default

  return (
    <button
      type={type}
      class={`${styles.button} ${variantClass}`}
      disabled={disabled}
      onClick={onClick}
      aria-haspopup={ariaHasPopup}
      role={role}
    >
      {children}
    </button>
  )
}

export type IconButtonVariant = 'default' | 'compact'

export interface IconButtonProps {
  icon: ComponentChildren
  label: string
  variant?: IconButtonVariant
  disabled?: boolean
  onClick?: (event: MouseEvent) => void
  title?: string
  ariaHasPopup?: JSX.AriaAttributes['aria-haspopup']
  ariaExpanded?: boolean
  ariaControls?: string
  /** DOM id, so a caller can look the element up (e.g. to restore focus) without a ref. */
  id?: string
  /** Extra class(es) appended after the component's own module classes — e.g. a global-CSS color-coding class like `file-action-btn rename`. */
  className?: string
}

/**
 * Icon-only button (toolbar/sidebar/file-row actions). `label` is required
 * and always becomes `aria-label` — icon glyphs are not accessible names.
 * See src/components/README.md#1-buttoniconbutton.
 */
export function IconButton({
  icon,
  label,
  variant = 'default',
  disabled = false,
  onClick,
  title,
  ariaHasPopup,
  ariaExpanded,
  ariaControls,
  id,
  className,
}: IconButtonProps) {
  const sizeClass = variant === 'compact' ? styles.iconButtonCompact : ''

  return (
    <button
      id={id}
      type="button"
      class={`${styles.iconButton} ${sizeClass}${className ? ` ${className}` : ''}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={title}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
    >
      {icon}
    </button>
  )
}
