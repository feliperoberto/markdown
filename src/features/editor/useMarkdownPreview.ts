import { useMemo } from 'preact/hooks'
import { renderMarkdown } from '@/lib/markdown'

/**
 * Derives sanitized preview HTML from the current editor content (issue #18).
 * Recomputed synchronously whenever `content` changes, matching the
 * prototype's `updatePreview()` being called directly from the editor's
 * `input` event handler (no debounce).
 *
 * `skip` (true while the preview pane is hidden, i.e. view === 'edit')
 * short-circuits the parse+sanitize entirely: the preview is invisible
 * (`.pane.hidden { display: none }`) but the `useMemo` on `content` alone
 * still re-ran marked+DOMPurify on the FULL document on every keystroke
 * even in pure edit mode, since a memo can't know "nobody's reading this
 * output right now." Callers must re-derive the real HTML once `skip`
 * flips back to false (the `content` dependency still catches that).
 */
export function useMarkdownPreview(content: string, skip = false): string {
  return useMemo(() => (skip ? '' : renderMarkdown(content)), [content, skip])
}
