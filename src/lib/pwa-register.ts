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
// module. This file itself has no test — it's a direct adapter with no
// branches worth covering, and it's excluded from the coverage gate in
// vitest.config.ts for the same reason it can't be transformed at all
// here. `src/lib/waitForEvent.ts`, the one piece of real logic it uses, is
// tested independently.
import { registerSW } from 'virtual:pwa-register'
import { waitForEventOrTimeout } from './waitForEvent'

// SKIP_WAITING is a postMessage — it resolves once *sent*, not once the
// browser has actually finished activating the new worker. Give
// controllerchange a bounded window to fire (normally milliseconds)
// before reloading regardless, so a slow activation can never hang a
// reload the user explicitly asked for.
const CONTROLLER_CHANGE_TIMEOUT_MS = 2000

export interface ServiceWorkerUpdateHandlers {
  /** A new service worker finished installing and is waiting to activate. */
  onNeedRefresh: () => void
  /** Fires once registration settles; `registration` is undefined if service workers are unsupported. */
  onRegistered: (registration: ServiceWorkerRegistration | undefined) => void
  onError?: (error: unknown) => void
}

export interface ServiceWorkerUpdater {
  /**
   * Tells the waiting worker to activate, waits (briefly, with a timeout
   * fallback) for it to actually take control, then reloads the page.
   *
   * Deliberately does NOT rely on vite-plugin-pwa's own built-in
   * reload-on-controllerchange behavior (triggered by omitting
   * `onNeedReload`, or handled by a caller-supplied one) — that behavior
   * only fires when workbox-window's `event.isUpdate` is true, which is
   * latched once at registration time as "did this tab already have a
   * controller". That's false on a first-ever visit or after a hard
   * reload, so clicking "Atualizar" there would activate and claim the
   * new worker but never actually reload, leaving the tab running stale
   * JS against a freshly-purged precache — exactly the hazard ADR-0003
   * exists to avoid. It would also fire in every OTHER open tab
   * (`clientsClaim()` claims all of them at once, and any tab that's
   * been open a while independently has `isUpdate: true`), reloading
   * tabs whose own user never asked for anything. This function reloads
   * unconditionally, and only as a direct effect of THIS call — no
   * shared listener that another tab's action could trigger.
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
 * `src/main.tsx` renders the app tree (which mounts
 * `src/features/pwa-update/PwaUpdatePrompt.tsx`, this module's only
 * runtime importer) synchronously during module evaluation, well before
 * `load` fires; if the app ever mounts lazily, this default would need
 * revisiting.
 */
export const registerServiceWorkerUpdates: RegisterServiceWorkerUpdates = (handlers) => {
  const updateSW = registerSW({
    onNeedRefresh: handlers.onNeedRefresh,
    // Suppress the library's own reload — see applyUpdate's doc comment
    // above for why. This function owns the reload instead.
    onNeedReload: () => {},
    onRegisteredSW: (_swScriptUrl, registration) => handlers.onRegistered(registration),
    onRegisterError: (error) => handlers.onError?.(error),
  })

  return {
    applyUpdate: async () => {
      await updateSW(true)
      if ('serviceWorker' in navigator) {
        await waitForEventOrTimeout(
          navigator.serviceWorker,
          'controllerchange',
          CONTROLLER_CHANGE_TIMEOUT_MS,
        )
      }
      window.location.reload()
    },
  }
}
