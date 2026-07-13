/**
 * Feature-detection helpers for the install experience (#26).
 *
 * We intentionally avoid UA-sniffing browser *names* (fragile, spoofable)
 * and instead combine:
 *  - iOS/iPadOS platform detection (`navigator.platform`/`userAgent`, plus
 *    the iPadOS-13+ "MacIntel + touch points" quirk), with
 *  - the absence of `beforeinstallprompt` support (the actual capability
 *    gap this feature works around).
 *
 * This mirrors the "Chromium handles itself via beforeinstallprompt,
 * iOS Safari needs manual instructions" split called out in the issue.
 */

/** True on iOS/iPadOS Safari (and other iOS browsers, which share WebKit's lack of `beforeinstallprompt`). */
export function isIosDevice(navigatorRef: Navigator = navigator): boolean {
  const userAgent = navigatorRef.userAgent ?? ''
  const platform = navigatorRef.platform ?? ''

  const isClassicIos = /iPad|iPhone|iPod/.test(userAgent) || /iPad|iPhone|iPod/.test(platform)

  // iPadOS 13+ reports as "MacIntel" but exposes touch points, unlike a
  // real Mac.
  const isIpadOs13Plus = platform === 'MacIntel' && navigatorRef.maxTouchPoints > 1

  return isClassicIos || isIpadOs13Plus
}

/** True when the app is already running installed/standalone (either platform). */
export function isRunningStandalone(windowRef: Window = window): boolean {
  const nav = windowRef.navigator as Navigator & { standalone?: boolean }
  return (
    windowRef.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
  )
}

/** True when `beforeinstallprompt` is a supported event on this browser (Chromium-family). */
export function supportsBeforeInstallPrompt(windowRef: Window = window): boolean {
  return 'onbeforeinstallprompt' in windowRef
}
