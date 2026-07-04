import { useMemo } from 'preact/hooks'
import { renderMarkdown } from '@/lib/markdown'

/**
 * Derives sanitized preview HTML from the current editor content (issue #18).
 * Recomputed synchronously whenever `content` changes, matching the
 * prototype's `updatePreview()` being called directly from the editor's
 * `input` event handler (no debounce).
 */
export function useMarkdownPreview(content: string): string {
  return useMemo(() => renderMarkdown(content), [content])
}
