/**
 * Public interface of the PWA install-experience feature (#26).
 *
 * Migrates the Chromium `beforeinstallprompt`/`appinstalled` wiring from
 * `prototype/index.html` and adds iOS/iPadOS parity (a one-time manual
 * "Add to Home Screen" instructional card), since iOS Safari never fires
 * `beforeinstallprompt`.
 */
export { PwaInstallPrompt } from './PwaInstallPrompt'
export { useInstallPrompt } from './useInstallPrompt'
export type { UseInstallPromptResult } from './useInstallPrompt'
export { isIosDevice, isRunningStandalone, supportsBeforeInstallPrompt } from './platform'
