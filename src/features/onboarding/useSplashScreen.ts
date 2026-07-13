import { useCallback, useState } from 'preact/hooks'
import { localStorageAdapter } from '@/lib/storage-adapter'

const STORAGE_KEY = 'splashDismissed'

/**
 * Drives the branded first-run splash screen ("Marcar para Existir",
 * issue: dropped entirely in the migration along with its `splashDismissed`
 * preference — an existing user who'd previously opted out of seeing it
 * would have had no way to express that, since nothing rendered a splash
 * at all).
 *
 * Mirrors the prototype's initSplashScreen/splashDismiss handlers: shown
 * on every load unless the user previously checked "Não mostrar de novo",
 * which persists the dismissal via localStorageAdapter.
 */
export function useSplashScreen() {
  const [isVisible, setIsVisible] = useState(() => localStorageAdapter.get(STORAGE_KEY) !== 'true')

  const dismiss = useCallback((dontShowAgain: boolean) => {
    if (dontShowAgain) {
      localStorageAdapter.set(STORAGE_KEY, 'true')
    }
    setIsVisible(false)
  }, [])

  return { isVisible, dismiss }
}
