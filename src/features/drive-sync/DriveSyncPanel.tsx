import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { IconButton, useToast } from '@/components'
import { driveSyncCopy } from './copy'
import styles from './DriveSyncPanel.module.css'

export interface DriveSyncPanelProps {
  /**
   * `true` when the cloud icon / Ctrl+S should redirect to the config
   * modal instead of syncing — see `useDriveSync`'s `needsConfig` doc
   * comment for why this is a single derived value rather than separate
   * `configured`/`connected` props re-checked here.
   */
  needsConfig: boolean
  isOnline: boolean
  sync: () => Promise<void>
  /**
   * "Fire an event" signal from `src/app/` for the Ctrl+S/Cmd+S shortcut
   * (`action: 'sync'`, `useSaveShortcut`). A save shortcut has no business
   * reaching into this component directly (see CONTRIBUTING.md's "Feature
   * taxonomy"), so `src/app/app.tsx` bumps `nonce` instead of calling
   * anything on this component. `nonce` (not just `action` changing) is
   * what actually triggers the effect — two 'sync' requests in a row must
   * each be observed, not just the first. `undefined` on mount so nothing
   * fires at startup.
   */
  actionSignal?: { action: 'sync'; nonce: number }
  /** Callback when the user clicks the header cloud button to sync or open config. */
  onClickCloudButton?: () => void
  /**
   * Callback when Ctrl+S/Cmd+S is pressed but Drive is not configured yet.
   * Should open the config modal so the user can configure.
   */
  onRequestConfig?: () => void
}

/**
 * Header cloud-icon entry point for triggering a Google Drive sync
 * (issue #110: split out of the combined config+sync panel). Handles the
 * Ctrl+S/Cmd+S keyboard shortcut via actionSignal. The cloud button syncs
 * directly when configured, or opens the config modal if not configured.
 * All connection/sync state is owned by `useDriveSync` in `src/app/app.tsx`
 * and passed down as props — this component is purely presentational plus
 * the Ctrl+S/Cmd+S signal handler.
 */
export function DriveSyncPanel({
  needsConfig,
  isOnline,
  sync,
  actionSignal,
  onClickCloudButton,
  onRequestConfig,
}: DriveSyncPanelProps): JSX.Element {
  const showToast = useToast()

  // "Fire an event" signal from src/app/ for the Ctrl+S/Cmd+S shortcut —
  // see actionSignal's doc comment. `nonce` alone drives the deps array,
  // so two same-action requests in a row are each observed. `needsConfig`/
  // `sync`/`onRequestConfig` are deliberately NOT tracked as dependencies
  // and are read fresh via closure from whichever render last changed
  // `nonce` — if they were tracked, this would re-fire (and re-sync)
  // merely because e.g. `needsConfig` flipped from a manual Connect click,
  // with no new keypress.
  useEffect(() => {
    if (actionSignal === undefined) return
    if (needsConfig) {
      // Not configured/connected — guide the user to the config panel so
      // they can set up Drive first. Show a warning toast and open the
      // config modal.
      showToast(driveSyncCopy.syncNeedsConnectionToast, 'warning')
      onRequestConfig?.()
      return
    }
    void sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSignal?.nonce])

  return (
    <span class={styles.iconWrapper}>
      <IconButton
        icon="☁️"
        label="Sincronizar com Google Drive"
        title={driveSyncCopy.syncShortcutHint}
        onClick={onClickCloudButton}
      />
      {!isOnline && (
        <span class={styles.offlineBadge} role="status" title={driveSyncCopy.offlineBadgeTitle}>
          <span class="visually-hidden">{driveSyncCopy.offlineBadgeLabel}</span>
        </span>
      )}
    </span>
  )
}
