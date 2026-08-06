/**
 * Public interface of the PWA update-prompt feature (ADR-0003).
 *
 * The service worker (`vite.config.ts`, `registerType: 'prompt'`) already
 * lets a new version install and wait rather than seizing an open tab; this
 * feature is what notices the waiting worker, re-checks for one on load,
 * focus, and reconnect, and shows a dismissible banner so the user decides
 * when to reload — never the app itself, mid-edit.
 */
export { PwaUpdatePrompt } from './PwaUpdatePrompt'
export { useServiceWorkerUpdate } from './useServiceWorkerUpdate'
export type {
  UseServiceWorkerUpdateOptions,
  UseServiceWorkerUpdateResult,
} from './useServiceWorkerUpdate'
export { UpdateBanner } from './UpdateBanner'
export type { UpdateBannerProps } from './UpdateBanner'
