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
 *
 * Renders TWO things, not one: a visually-hidden `role="status"`/
 * `aria-live="polite"` region that is ALWAYS mounted (empty when
 * `!open`), and the actual visible banner box, which mounts/unmounts
 * freely with `open`. Screen readers only reliably announce a MUTATION to
 * an EXISTING live region — a whole new subtree that appears already
 * containing text (i.e. putting `aria-live` directly on the visible box
 * and conditionally mounting/unmounting it) is not guaranteed to be
 * announced by AT. Keeping one small, permanent, invisible announcer
 * decouples "will this be announced" from "how does this look".
 */
export function UpdateBanner({ open, onUpdate, onDismiss }: UpdateBannerProps): JSX.Element {
  return (
    <>
      <div class={styles.visuallyHidden} role="status" aria-live="polite">
        {open ? pwaUpdateCopy.bannerTitle : ''}
      </div>
      {open && (
        <div class={styles.banner}>
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
            <Button variant="default" onClick={onDismiss}>
              {pwaUpdateCopy.dismissButtonLabel}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
