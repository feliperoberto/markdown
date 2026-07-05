import { useCallback, useEffect, useState } from 'preact/hooks'
import { FONT_SIZES, type EditorFontSize } from '@/features/editor/types'

const STORAGE_KEY = 'fontScale'
const CSS_VAR = '--editor-font-size'
const DEFAULT_SIZE: EditorFontSize = '13px'

function readStoredFontSize(): EditorFontSize {
  const stored = localStorage.getItem(STORAGE_KEY)
  return (FONT_SIZES as readonly string[]).includes(stored ?? '')
    ? (stored as EditorFontSize)
    : DEFAULT_SIZE
}

/**
 * Manages the editor font-size cycling behavior (issue #18): clicking the
 * "Aa" button advances through FONT_SIZES with wrap-around, persists the
 * choice to localStorage, and applies it via the `--editor-font-size` CSS
 * custom property on the document root — matching the prototype 1:1.
 */
export function useEditorFontSize() {
  const [fontSize, setFontSizeState] = useState<EditorFontSize>(() => readStoredFontSize())

  useEffect(() => {
    document.documentElement.style.setProperty(CSS_VAR, fontSize)
    localStorage.setItem(STORAGE_KEY, fontSize)
  }, [fontSize])

  const cycleFontSize = useCallback(() => {
    setFontSizeState((current) => {
      const currentIndex = FONT_SIZES.indexOf(current)
      const nextIndex = (currentIndex + 1) % FONT_SIZES.length
      return FONT_SIZES[nextIndex] ?? DEFAULT_SIZE
    })
  }, [])

  return { fontSize, cycleFontSize }
}
