import { HEADING_ID_PREFIX, slugify } from './slugify'

/**
 * Resolution of in-document `#fragment` links, shared by the on-screen
 * preview (scrolling) and the print copy (re-pointing links at its own
 * ids), so both read a link the same way. Always scoped to a root, never
 * `document`: ids repeat while the preview and the print copy coexist.
 */

/**
 * The `#fragment` href of a link-like element, or null when it points
 * elsewhere. Leading whitespace is ignored, as browsers do when following
 * the link. Covers `<a>` and image-map `<area>`.
 */
export function fragmentHref(el: Element): string | null {
  if (el.tagName !== 'A' && el.tagName !== 'AREA') return null
  const href = el.getAttribute('href')?.trim()
  return href?.startsWith('#') ? href : null
}

/** Selector for the elements `fragmentHref` may accept (it makes the final call). */
export const LINK_SELECTOR = 'a[href], area[href]'

/** The decoded fragment of a `#…` href, or null when it is not one or is malformed. */
export function decodeFragment(href: string): string | null {
  if (!href.startsWith('#')) return null
  try {
    return decodeURIComponent(href.slice(1))
  } catch {
    return null
  }
}

/**
 * Indexes `root` once and returns a lookup for decoded fragments: an exact
 * id, then the generated heading id for GitHub-style links (`#Introdução`),
 * then a legacy `<a name>` anchor. The first element wins when an id
 * repeats; an empty fragment resolves to nothing. Build it once per root
 * when resolving many links.
 */
export function createFragmentResolver(
  root: HTMLElement,
): (fragment: string) => HTMLElement | null {
  const byId = new Map<string, HTMLElement>()
  for (const el of root.querySelectorAll<HTMLElement>('[id]')) {
    if (el.id && !byId.has(el.id)) byId.set(el.id, el)
  }
  const byName = new Map<string, HTMLElement>()
  for (const el of root.querySelectorAll<HTMLElement>('a[name]')) {
    const name = el.getAttribute('name')
    if (name && !byName.has(name)) byName.set(name, el)
  }
  return (fragment) => {
    if (!fragment) return null
    return (
      byId.get(fragment) ??
      byId.get(HEADING_ID_PREFIX + slugify(fragment)) ??
      byName.get(fragment) ??
      null
    )
  }
}

/** One-off lookup; see `createFragmentResolver` for many links in one root. */
export function resolveFragment(root: HTMLElement, fragment: string): HTMLElement | null {
  return createFragmentResolver(root)(fragment)
}

/**
 * What a decoded fragment points at: the element it names, `'top'` for
 * `#`/`#top` when the document has no element of that name (the browser's
 * "top of the document"), or null when it points at nothing.
 */
export function resolveLinkTarget(
  resolve: (fragment: string) => HTMLElement | null,
  fragment: string,
): HTMLElement | 'top' | null {
  const target = resolve(fragment)
  if (target) return target
  return fragment === '' || fragment.toLowerCase() === 'top' ? 'top' : null
}
