import { useCallback, useEffect, useState } from 'preact/hooks'

// Safari (desktop + iOS) never adopted the unprefixed Fullscreen API;
// iOS Safari additionally has no `requestFullscreen` on non-<video>
// elements at all, so `docEl.requestFullscreen` is simply undefined
// there — every call site below already guards for that (`?.()` /
// `if (!fn) return`), which is the "graceful no-op on unsupported
// browsers" the feature needs on iOS.
interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element
  webkitExitFullscreen?: () => Promise<void>
}
interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>
}

function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

/**
 * Fullscreen toggle (issue F3): wraps the (vendor-prefix-aware)
 * Fullscreen API so the editor can be used distraction-free. Mirrors the
 * prototype's toggleFullscreen()/fullscreenchange listener, minus the
 * auto-request-on-load behavior (browsers require a user gesture to grant
 * fullscreen — an unprompted request 500ms after load either no-ops or
 * throws in every modern browser, so it was never reliable to begin with).
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => getFullscreenElement() !== null)

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(getFullscreenElement() !== null)
    }
    document.addEventListener('fullscreenchange', handleChange)
    document.addEventListener('webkitfullscreenchange', handleChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleChange)
      document.removeEventListener('webkitfullscreenchange', handleChange)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!getFullscreenElement()) {
      const docEl = document.documentElement as FullscreenElement
      const request =
        docEl.requestFullscreen?.bind(docEl) ?? docEl.webkitRequestFullscreen?.bind(docEl)
      request?.()?.catch(() => {})
    } else {
      const doc = document as FullscreenDocument
      const exit = doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc)
      exit?.()?.catch(() => {})
    }
  }, [])

  return { isFullscreen, toggleFullscreen }
}
