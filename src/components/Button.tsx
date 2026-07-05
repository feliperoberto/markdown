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
}: IconButtonProps) {
  const sizeClass = variant === 'compact' ? styles.iconButtonCompact : ''

  return (
    <button
      type="button"
      class={`${styles.iconButton} ${sizeClass}`}
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
