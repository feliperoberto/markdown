/**
 * Resolves once `target` fires `eventName`, or after `timeoutMs`, whichever
 * comes first — never rejects, and only ever settles once. Used by
 * `pwa-register.ts` to bound how long it waits for a service worker's
 * `controllerchange` before reloading anyway (ADR-0003): the event is
 * expected almost immediately after a SKIP_WAITING message, but a reload
 * the user explicitly asked for must never hang indefinitely if it
 * doesn't fire.
 */
export function waitForEventOrTimeout(
  target: EventTarget,
  eventName: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const settle = () => {
      target.removeEventListener(eventName, settle)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(settle, timeoutMs)
    target.addEventListener(eventName, settle)
  })
}
