import { useEffect, useState } from 'preact/hooks'

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
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

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
