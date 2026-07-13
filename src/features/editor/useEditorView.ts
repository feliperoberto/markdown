import { useCallback, useState } from 'preact/hooks'
import type { EditorView } from '@/features/editor/types'

/**
 * Manages the edit/preview view-toggle state (issue #18), replacing the
 * prototype's global `currentView` mutable variable with local component
 * state.
 */
export function useEditorView(initialView: EditorView = 'edit') {
  const [view, setView] = useState<EditorView>(initialView)

  const switchView = useCallback((next: EditorView) => {
    setView(next)
  }, [])

  return { view, switchView }
}
