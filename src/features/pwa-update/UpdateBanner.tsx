import type { JSX } from 'preact'
import { Button } from '@/components'
import { pwaUpdateCopy } from './copy'
import styles from './UpdateBanner.module.css'

export interface UpdateBannerProps {
  open: boolean
  onUpdate: () => void
  onDismiss: () => void
}

/**
 * Persistent, non-modal notice that a new app version is waiting
 * (ADR-0003). Deliberately not built on `Toast` (non-interactive by
 * contract, auto-dismisses — see src/components/Toast.tsx) or `Modal`
 * (steals focus, blocks the editor): an update must never interrupt
 * someone mid-sentence, so this stays out of the way until acted on.
 * `role="status"`/`aria-live="polite"`, not `"alert"` — this is not an
 * error and should never interrupt a screen-reader user either.
 */
export function UpdateBanner({ open, onUpdate, onDismiss }: UpdateBannerProps): JSX.Element | null {
  if (!open) return null

  return (
    <div class={styles.banner} role="status" aria-live="polite">
      <div class={styles.text}>
        <p class={styles.title}>{pwaUpdateCopy.bannerTitle}</p>
        <p class={styles.body}>{pwaUpdateCopy.bannerBody}</p>
      </div>
      <div class={styles.actions}>
        <Button
          variant="primary"
          ariaLabel={pwaUpdateCopy.updateButtonAriaLabel}
          onClick={onUpdate}
        >
          {pwaUpdateCopy.updateButtonLabel}
        </Button>
        <Button
          variant="default"
          ariaLabel={pwaUpdateCopy.dismissButtonAriaLabel}
          onClick={onDismiss}
        >
          {pwaUpdateCopy.dismissButtonLabel}
        </Button>
      </div>
    </div>
  )
}
