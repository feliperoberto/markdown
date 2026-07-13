import type { JSX } from 'preact'
import { Button } from '@/components'

export interface InstallButtonProps {
  onInstall: () => void
}

/**
 * Chromium install trigger — ports `#installBtn` from
 * `prototype/index.html:1712-1715` (the hidden sidebar-footer "Instalar"
 * button that `beforeinstallprompt` reveals) into a Preact component.
 * Only rendered by the parent once `useInstallPrompt().canInstall` is true.
 */
export function InstallButton({ onInstall }: InstallButtonProps): JSX.Element {
  return (
    <Button variant="primary" onClick={onInstall}>
      <span aria-hidden="true">📲</span> Instalar
    </Button>
  )
}
