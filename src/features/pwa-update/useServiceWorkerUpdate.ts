import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { RegisterServiceWorkerUpdates, ServiceWorkerUpdater } from '@/lib/pwa-register'

const DEFAULT_MIN_CHECK_INTERVAL_MS = 60_000

export interface UseServiceWorkerUpdateOptions {
  /**
   * Registers the service worker. Injected (rather than importing
   * `@/lib/pwa-register` directly) so tests never have to resolve the
   * build-time `virtual:pwa-register` module — see `@/lib/pwa-register`'s
   * header comment.
   */
  register: RegisterServiceWorkerUpdates
  /** Minimum gap between two `registration.update()` probes. Default 60s. */
  minCheckIntervalMs?: number
  /** Injected clock, so the throttle is testable without real timers. Default `Date.now`. */
  now?: () => number
}

export interface UseServiceWorkerUpdateResult {
  /** A new version is waiting to activate; show the update banner. */
  needRefresh: boolean
  /** Promotes the waiting worker. The page reloads once it takes control. */
  applyUpdate: () => void
  /** Hides the banner for this page load only — never persisted, see below. */
  dismiss: () => void
}

/**
 * Wires the app to the service worker's update lifecycle (ADR-0003). The
 * worker itself already waits rather than seizing control
 * (`registerType: 'prompt'` in vite.config.ts) — this hook is what notices
 * a waiting worker and re-checks for one at the moments a user could
 * plausibly act on it: on load, when the tab regains focus, and when the
 * browser comes back online. Deliberately no polling timer — a background
 * tab never probes.
 *
 * Dismissing the banner is NOT persisted to `localStorage`: a persisted
 * dismissal would need to be keyed to the specific version being offered,
 * which the page has no way to name, so an unkeyed one would silently
 * suppress every future prompt too. One page load is the right unit —
 * `needRefresh` starts fresh on every load, because workbox-window reports
 * an already-waiting worker as soon as it registers.
 */
export function useServiceWorkerUpdate({
  register,
  minCheckIntervalMs = DEFAULT_MIN_CHECK_INTERVAL_MS,
  now = Date.now,
}: UseServiceWorkerUpdateOptions): UseServiceWorkerUpdateResult {
  const [needRefresh, setNeedRefresh] = useState(false)
  const updaterRef = useRef<ServiceWorkerUpdater | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)
  // -Infinity, not 0: guarantees the very first check() always passes the
  // throttle below regardless of what `now()` returns. Relying on epoch
  // time being "large" (real Date.now() is always ≫ minCheckIntervalMs
  // above 0) would work by accident in production but silently skip the
  // first check under an injected clock that itself starts at 0 in tests.
  const lastCheckedAtRef = useRef(-Infinity)

  const check = useCallback(() => {
    // A hidden tab must not probe — `visibilitychange` also fires on hide.
    if (document.visibilityState !== 'visible') return
    // Skip a guaranteed-failing fetch.
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const elapsed = now() - lastCheckedAtRef.current
    if (elapsed < minCheckIntervalMs) return
    lastCheckedAtRef.current = now()
    // update() rejects on a network failure — swallow it deliberately so
    // alt-tabbing on an offline tab never logs an unhandled rejection.
    registrationRef.current?.update().catch(() => {})
  }, [minCheckIntervalMs, now])

  // Register exactly once for the component's lifetime — deliberately NOT
  // depending on `register`, which is expected to be a referentially
  // stable prop for as long as the component is mounted (same assumption
  // DriveSyncPanel.tsx makes for its sync provider). Re-registering on
  // every render would attach a second service-worker registration.
  useEffect(() => {
    const updater = register({
      onNeedRefresh: () => setNeedRefresh(true),
      onRegistered: (registration) => {
        registrationRef.current = registration
        // "On load" trigger: probe for a fresher sw.js as soon as we have
        // a registration handle, in case one shipped since whatever
        // installed this registration (e.g. a long-cached HTML shell).
        check()
      },
      onError: (error) => {
        // A failed registration must not produce a scary banner — there
        // is nothing actionable for the user here.
        console.error('Service worker registration failed:', error)
      },
    })
    updaterRef.current = updater
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register/check intentionally excluded: registration must run exactly once per mount, not on every identity change.
  }, [])

  useEffect(() => {
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', check)
    }
  }, [check])

  const applyUpdate = useCallback(() => {
    updaterRef.current?.applyUpdate().catch(() => {})
  }, [])

  const dismiss = useCallback(() => setNeedRefresh(false), [])

  return { needRefresh, applyUpdate, dismiss }
}
