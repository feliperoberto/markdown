import type { JSX } from 'preact'
import { useTheme } from './useTheme'
import { IconButton } from '@/components'

/** Header icon button that flips the light/dark theme (see useTheme). */
export function ThemeToggle(): JSX.Element {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <IconButton
      icon={isDark ? '☀️' : '🌙'}
      label="Alternar tema claro/escuro"
      title="Alternar tema"
      onClick={toggleTheme}
    />
  )
}
