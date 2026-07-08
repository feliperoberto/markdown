import { useCallback, useEffect, useState } from 'preact/hooks'
import { localStorageAdapter } from '@/lib/storage-adapter'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readInitialTheme(): Theme {
  const stored = localStorageAdapter.get(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return prefersDark() ? 'dark' : 'light'
}

/**
 * Light/dark theme toggle (issue F1): a `theme` preference existed for
 * every user of the prototype (persisted, `prefers-color-scheme`-aware)
 * and was silently dropped in the migration — an existing user's saved
 * choice never applied since nothing ever read the `theme` localStorage
 * key or set `data-theme` on the document root. `tokens.css`'s
 * `[data-theme="dark"]` palette (see its header comment, issue #14) was
 * already shipped and simply had no code driving it.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => readInitialTheme())

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorageAdapter.set(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme }
}
