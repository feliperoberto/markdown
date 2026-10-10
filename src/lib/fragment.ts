import { HEADING_ID_PREFIX, slugify } from './slugify'

/**
 * Resolution of in-document `#fragment` links, shared by the on-screen
 * preview (scrolling) and the print copy (re-pointing links at its own
 * ids), so both read a link the same way. Always scoped to a root, never
 * `document`: ids repeat while the preview and the print copy coexist.
 */

/** The decoded fragment of a `#…` href, or null when it is malformed. */
export function decodeFragment(href: string): string | null {
  try {
    return decodeURIComponent(href.slice(1))
  } catch {
    return null
  }
}

/** First element in `root` with this id. */
export function findById(root: HTMLElement, id: string): HTMLElement | null {
  if (!id) return null
  for (const el of root.querySelectorAll<HTMLElement>('[id]')) {
    if (el.id === id) return el
  }
  return null
}

/**
 * Resolves a decoded fragment inside `root`: an exact id, then the
 * generated heading id for GitHub-style links (`#Introdução`), then a legacy
 * `<a name>` anchor.
 */
export function resolveFragment(root: HTMLElement, fragment: string): HTMLElement | null {
  return (
    findById(root, fragment) ??
    findById(root, HEADING_ID_PREFIX + slugify(fragment)) ??
    Array.from(root.querySelectorAll<HTMLElement>('a[name]')).find(
      (el) => el.getAttribute('name') === fragment,
    ) ??
    null
  )
}

/** Whether a fragment means "the top of the document" (`#`, `#top`). */
export function isTopFragment(fragment: string): boolean {
  return fragment === '' || fragment.toLowerCase() === 'top'
}
