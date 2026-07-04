import styles from './Checkbox.module.css'

export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

/**
 * Native checkbox styled via `accent-color`, used for batch file selection
 * in the projects sidebar. See src/components/README.md#4-checkbox.
 */
export function Checkbox({ checked, onChange, label, disabled = false }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      class={styles.checkbox}
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
    />
  )
}
