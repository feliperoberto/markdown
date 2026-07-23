import { useCallback, useEffect, useState } from 'preact/hooks'
import { FONT_SCALES, type EditorFontScale } from '@/features/editor/types'
import { localStorageAdapter } from '@/lib/storage-adapter'

const STORAGE_KEY = 'fontScale'
const CSS_VAR = '--font-scale'
const DEFAULT_SCALE: EditorFontScale = '1'

function readStoredFontScale(): EditorFontScale {
  const stored = localStorageAdapter.get(STORAGE_KEY)
  return (FONT_SCALES as readonly string[]).includes(stored ?? '')
    ? (stored as EditorFontScale)
    : DEFAULT_SCALE
}

/**
 * Manages the font-size cycling behavior (issue #92): clicking the "Aa"
 * button advances through FONT_SCALES with wrap-around, persists the choice
 * to localStorage, and applies it via the `--font-scale` CSS custom
 * property on the document root. Unlike the previous implementation (which
 * set a px `--editor-font-size` that only the textarea consumed), the scale
 * is a unitless multiplier consumed by BOTH the editor and the preview
 * pane, so toggling now resizes what you read as well as what you type.
 */
export function useEditorFontSize() {
  const [fontScale, setFontScaleState] = useState<EditorFontScale>(() => readStoredFontScale())

  useEffect(() => {
    document.documentElement.style.setProperty(CSS_VAR, fontScale)
    localStorageAdapter.set(STORAGE_KEY, fontScale)
  }, [fontScale])

  const cycleFontSize = useCallback(() => {
    setFontScaleState((current) => {
      const currentIndex = FONT_SCALES.indexOf(current)
      const nextIndex = (currentIndex + 1) % FONT_SCALES.length
      return FONT_SCALES[nextIndex] ?? DEFAULT_SCALE
    })
  }, [])

  return { fontScale, cycleFontSize }
}
