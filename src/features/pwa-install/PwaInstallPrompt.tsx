import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { InstallButton } from './InstallButton'
import { IosInstallCard } from './IosInstallCard'
import { useInstallPrompt } from './useInstallPrompt'
import { localStorageAdapter } from '@/lib/storage-adapter'

const IOS_CARD_DISMISSED_KEY = 'iosInstallCardDismissed'

/**
 * App-shell entry point for #26: Chromium gets the migrated
 * `beforeinstallprompt`-driven "Instalar" button; iOS/iPadOS (which has no
 * such event) gets a one-time dismissible instructional card instead.
 * Renders nothing once the app is already installed/standalone, and
 * nothing at all on browsers that support neither path (per the issue's
 * "skip browsers that don't support installability" scope).
 */
export function PwaInstallPrompt(): JSX.Element | null {
  const { canInstall, promptInstall, isIos, isStandalone } = useInstallPrompt()
  const [iosCardOpen, setIosCardOpen] = useState(false)

  useEffect(() => {
    if (!isIos || isStandalone) return
    const alreadyDismissed = localStorageAdapter.get(IOS_CARD_DISMISSED_KEY) === 'true'
    if (!alreadyDismissed) setIosCardOpen(true)
  }, [isIos, isStandalone])

  function dismissIosCard() {
    localStorageAdapter.set(IOS_CARD_DISMISSED_KEY, 'true')
    setIosCardOpen(false)
  }

  if (isStandalone) return null

  return (
    <>
      {canInstall && <InstallButton onInstall={promptInstall} />}
      {isIos && <IosInstallCard open={iosCardOpen} onClose={dismissIosCard} />}
    </>
  )
}
