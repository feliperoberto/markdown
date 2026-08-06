// Thin wrapper around vite-plugin-pwa's `virtual:pwa-register` — the ONLY
// file in this codebase allowed to import it (see ADR-0003).
//
// `vitest.config.ts` deliberately does not load the VitePWA plugin (see its
// own header comment), so the virtual module never resolves under Vitest.
// `src/features/pwa-update/useServiceWorkerUpdate.ts` therefore imports
// only this file's *types* (`import type`), which `isolatedModules` erases
// at transform time — the hook's module graph never reaches this file, or
// the virtual import, under test. Tests pass a plain fake object matching
// `RegisterServiceWorkerUpdates` instead of mocking a build-time virtual
// module.
import { registerSW } from 'virtual:pwa-register'

export interface ServiceWorkerUpdateHandlers {
  /** A new service worker finished installing and is waiting to activate. */
  onNeedRefresh: () => void
  /** Fires once registration settles; `registration` is undefined if service workers are unsupported. */
  onRegistered: (registration: ServiceWorkerRegistration | undefined) => void
  onError?: (error: unknown) => void
}

export interface ServiceWorkerUpdater {
  /**
   * Tells the waiting worker to activate. Once it takes control, the
   * client library reloads the page itself (we don't pass `onNeedReload`,
   * so its default `window.location.reload()` fallback runs) — this
   * function does not reload directly, so callers must not also call
   * `location.reload()`.
   */
  applyUpdate: () => Promise<void>
}

export type RegisterServiceWorkerUpdates = (
  handlers: ServiceWorkerUpdateHandlers,
) => ServiceWorkerUpdater

/**
 * Registers the service worker and adapts vite-plugin-pwa's callback shape
 * to this app's vocabulary. Registration is deferred to the `window` `load`
 * event by default (`immediate` left `false`) — safe here because
 * `src/main.tsx` renders synchronously during module evaluation, well
 * before `load` fires; if the app ever mounts lazily, this default would
 * need revisiting.
 */
export const registerServiceWorkerUpdates: RegisterServiceWorkerUpdates = (handlers) => {
  const updateSW = registerSW({
    onNeedRefresh: handlers.onNeedRefresh,
    onRegisteredSW: (_swScriptUrl, registration) => handlers.onRegistered(registration),
    onRegisterError: (error) => handlers.onError?.(error),
  })
  return { applyUpdate: () => updateSW(true) }
}
