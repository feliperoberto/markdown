import type { JSX } from 'preact'
import { useFullscreen } from './useFullscreen'
import { IconButton } from '@/components'
import { isRunningStandalone } from '@/features/pwa-install'

/**
 * Header icon button that toggles fullscreen (see useFullscreen).
 *
 * Hidden once the app is already running as an installed/standalone PWA:
 * the browser chrome is already gone in that mode, so toggling the
 * Fullscreen API on top of it has no real effect beyond an unexplained
 * status-bar color change (mirrors PwaInstallPrompt's same `isStandalone`
 * guard, for the same "nothing useful to do once already installed"
 * reason).
 */
export function FullscreenToggle(): JSX.Element | null {
  const { isFullscreen, toggleFullscreen } = useFullscreen()

  if (isRunningStandalone()) return null

  return (
    <IconButton
      icon={isFullscreen ? '⛔' : '⛶'}
      label="Alternar tela cheia"
      title="Tela cheia"
      onClick={toggleFullscreen}
    />
  )
}
