import type { JSX } from 'preact'
import { IconButton } from '@/components'
import { isIosDevice, isRunningStandalone } from '@/features/pwa-install'

export interface PdfExportButtonProps {
  /** Usually `usePrintExport().printDocument`. */
  onPrint: () => void | Promise<void>
  disabled?: boolean
}

/**
 * Toolbar icon button that exports the current file as PDF through the
 * browser's print dialog (see usePrintExport).
 *
 * Hidden on iOS/iPadOS when running as an installed/standalone PWA:
 * `window.print()` is unreliable there (often a silent no-op, since the
 * standalone web view has no share/print chrome to hand off to), so a
 * button that might do nothing is worse than no button. Mirrors
 * FullscreenToggle's same `isRunningStandalone()` guard.
 */
export function PdfExportButton({
  onPrint,
  disabled = false,
}: PdfExportButtonProps): JSX.Element | null {
  if (isIosDevice() && isRunningStandalone()) return null

  return (
    <IconButton
      icon="🖨️"
      label="Exportar PDF do arquivo atual"
      title="Exportar PDF (via impressão)"
      variant="compact"
      className="toolbar-pdf-btn"
      disabled={disabled}
      onClick={() => void onPrint()}
    />
  )
}
