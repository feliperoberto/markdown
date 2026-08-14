import { useEffect, useState } from 'preact/hooks'

/**
 * Single shared read of `navigator.onLine`, framework-agnostic (a plain
 * function, not a hook) so it's callable from non-component code too — e.g.
 * `google-drive-provider.ts`'s async class methods, which can't call hooks.
 * Previously that provider had its own independent `navigator.onLine ===
 * false` check, duplicating this exact logic; the two could in theory drift
 * (e.g. different re-render timing around `online`/`offline` events).
 * Defaults to online (`true`) outside a browser (SSR/tests), where there's
 * no meaningful "offline" to report.
 */
export function isNavigatorOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

/**
 * Tracks browser connectivity via `navigator.onLine` plus the `online`/
 * `offline` window events (issue #25).
 *
 * `navigator.onLine` only reflects "has a network interface", not "can
 * actually reach the internet" — good enough here since the only thing
 * gated on it is a reassuring UI hint, not a hard precondition for
 * correctness. The actual sync call still has its own error handling for
 * the case where the interface is up but the request still fails.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(isNavigatorOnline)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
