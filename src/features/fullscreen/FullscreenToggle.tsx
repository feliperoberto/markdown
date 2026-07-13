import type { JSX } from 'preact'
import { useFullscreen } from './useFullscreen'
import { IconButton } from '@/components'

/** Header icon button that toggles fullscreen (see useFullscreen). */
export function FullscreenToggle(): JSX.Element {
  const { isFullscreen, toggleFullscreen } = useFullscreen()

  return (
    <IconButton
      icon={isFullscreen ? '⛔' : '⛶'}
      label="Alternar tela cheia"
      title="Tela cheia"
      onClick={toggleFullscreen}
    />
  )
}
