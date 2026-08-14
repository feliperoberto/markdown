import { useEffect, useState } from 'preact/hooks'

/**
 * Single shared read of `navigator.onLine`, framework-agnostic (a plain
 * function, not a hook) so it's callable from non-component code too — e.g.
 * `google-drive-provider.ts`'s async class methods, which can't call hooks.
 * Previously that provider had its own independent `navigator.onLine ===
 * false` check, duplicating this exact logic; the two could in theory drift
 * (e.g. different re-render timing around `online`/`offline` events).
 *
 * Deliberately `!== false` rather than returning `navigator.onLine` as-is:
 * treats anything other than a strict `false` — no `navigator`, no `onLine`
 * property, or any other non-boolean value a non-standard runtime might
 * expose — as online. `Navigator.onLine`'s ambient type claims `boolean`
 * unconditionally, but that's not runtime-guaranteed everywhere this is
 * called from (e.g. Node has a global `navigator` with no `onLine` at all);
 * defaulting to "online" on anything but an explicit `false` means an
 * unusual runtime falls back to attempting the network call and getting a
 * real error, rather than silently refusing to sync.
 */
export function isNavigatorOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
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
