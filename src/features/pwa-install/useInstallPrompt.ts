import { useEffect, useState } from 'preact/hooks'
import { isIosDevice, isRunningStandalone, supportsBeforeInstallPrompt } from './platform'

/** Minimal typing for the non-standard `BeforeInstallPromptEvent`. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface UseInstallPromptResult {
  /** Chromium: a captured `beforeinstallprompt` event is ready to be shown. */
  canInstall: boolean
  /** Shows the native Chromium install prompt. No-op if `canInstall` is false. */
  promptInstall: () => Promise<void>
  /** True on iOS/iPadOS, where `beforeinstallprompt` does not exist and manual "Add to Home Screen" steps are required instead. */
  isIos: boolean
  /** True once the app is already installed/running standalone, on either platform. */
  isStandalone: boolean
}

/**
 * Migrates the Chromium `beforeinstallprompt`/`appinstalled` wiring from
 * `prototype/index.html:2671-2695` into a Preact hook, and adds the
 * iOS-capability signal the old prototype never had (see #26).
 */
export function useInstallPrompt(): UseInstallPromptResult {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(() => isRunningStandalone())

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    function handleAppInstalled() {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  async function promptInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  return {
    canInstall: deferredPrompt !== null,
    promptInstall,
    isIos: isIosDevice() && !supportsBeforeInstallPrompt(),
    isStandalone,
  }
}
