import {
  LINK_SELECTOR,
  createFragmentResolver,
  decodeFragment,
  fragmentHref,
  resolveLinkTarget,
} from '@/lib/fragment'

/**
 * Print-time adaptations of the rendered document: what "the same document,
 * on paper" needs that CSS alone can't express. Applied only to the print
 * root's own render (never the on-screen preview), right after it is filled.
 */

/** Custom property on `<html>` holding the running head, read by `@page` in document.css. */
export const RUNNING_HEAD_PROPERTY = '--print-running-head'

/** Prefix of the ids the print copy gives to the targets of its in-document links. */
export const PRINT_ID_PREFIX = 'print-'

/** Longest running head, in characters, before it is shortened with "…". */
export const RUNNING_HEAD_MAX_LENGTH = 72

const PRINTABLE_URL = /^(?:https?:|mailto:)/i

function normalizeUrl(value: string): string {
  return value
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/**
 * The destination a printed link should disclose, or null when the reader
 * already sees it: relative/in-page links (nothing useful to print) and
 * autolinks, whose text is the URL itself.
 */
export function printableUrl(link: HTMLAnchorElement): string | null {
  const href = link.getAttribute('href')?.trim() ?? ''
  if (!PRINTABLE_URL.test(href)) return null
  const shown = href.replace(/^mailto:/i, '')
  if (normalizeUrl(link.textContent ?? '') === normalizeUrl(shown)) return null
  return shown
}

/** `encodeURIComponent`, or null for an id it can't encode (a lone surrogate). */
function encodeId(id: string): string | null {
  try {
    return encodeURIComponent(id)
  } catch {
    return null
  }
}

/**
 * Re-points the document's own `#fragment` links at ids that exist only in
 * this copy. While printing, the on-screen preview (same markdown, same ids)
 * is still in the DOM, hidden, and comes first: a link resolved by id would
 * land on that copy, which has no layout, so the saved PDF would get no
 * usable destination for it.
 *
 * Only the ids a link actually targets are renamed (`print-` + the id); the
 * ids nothing links to keep their value, so references between elements
 * keep resolving as they did. That includes `aria-labelledby`, `<label
 * for>` and SVG `url(#id)`: while the hidden preview is mounted, a
 * document-wide lookup of those still finds the preview's duplicate, which
 * this does not change. A link target that is also referenced that way
 * loses that reference in this copy only (paper has no use for it).
 *
 * `#` and `#top` point at the document's first element (the print root
 * itself is long-lived, so it never gets an id). A link that resolves to
 * nothing is left alone. Meant to run once on a freshly rendered copy:
 * running it again would rename the already-renamed ids.
 */
function scopeFragmentLinks(doc: HTMLElement): void {
  const links: { link: Element; fragment: string }[] = []
  for (const link of doc.querySelectorAll(LINK_SELECTOR)) {
    const fragment = decodeFragment(fragmentHref(link) ?? '')
    if (fragment !== null) links.push({ link, fragment })
  }
  if (links.length === 0) return

  const used = new Set<string>()
  for (const scope of [doc.ownerDocument, doc]) {
    for (const el of scope.querySelectorAll('[id]')) used.add(el.id)
  }
  const unique = (base: string): string => {
    let id = PRINT_ID_PREFIX + base
    for (let n = 2; used.has(id); n++) id = `${PRINT_ID_PREFIX}${base}-${n}`
    used.add(id)
    return id
  }

  // Resolve every link before renaming anything: a rename would make the
  // next link to the same target miss it.
  const resolve = createFragmentResolver(doc)
  const resolved: { link: Element; target: HTMLElement }[] = []
  for (const { link, fragment } of links) {
    const found = resolveLinkTarget(resolve, fragment)
    const target = found === 'top' ? doc.firstElementChild : found
    if (target instanceof HTMLElement) resolved.push({ link, target })
  }

  const ids = new Map<HTMLElement, string>()
  let anchors = 0
  for (const { link, target } of resolved) {
    let id = ids.get(target)
    if (!id) {
      id = unique(target.id || `anchor-${++anchors}`)
      ids.set(target, id)
      target.id = id
    }
    const encoded = encodeId(id)
    if (encoded !== null) link.setAttribute('href', `#${encoded}`)
  }
}

/**
 * - Opens every `<details>`: paper can't be clicked, so a collapsed one
 *   would print its summary and silently drop the rest.
 * - Marks links with `data-print-url`, which the print theme appends after
 *   the link text: a link's meaning is where it goes, and paper can't
 *   follow it (the PDF itself keeps the links clickable).
 * - Gives in-document links targets of their own (see `scopeFragmentLinks`),
 *   so they stay clickable in the PDF.
 */
export function preparePrintDocument(doc: HTMLElement): void {
  for (const details of doc.querySelectorAll('details')) {
    details.open = true
  }
  // Only this function says what a printed link discloses: raw HTML in the
  // document could otherwise carry its own attribute and print a
  // destination the link doesn't actually have.
  for (const element of doc.querySelectorAll('[data-print-url]')) {
    element.removeAttribute('data-print-url')
  }
  for (const link of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const url = printableUrl(link)
    if (url) link.dataset.printUrl = url
  }
  scopeFragmentLinks(doc)
}

/**
 * The running head printed atop every page after the first: the document's
 * own title (its first `<h1>`), falling back to the file name.
 */
export function runningHead(doc: HTMLElement, fileName: string): string {
  const title = (doc.querySelector('h1')?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const head = title || fileName.trim()
  return head.length > RUNNING_HEAD_MAX_LENGTH
    ? `${head.slice(0, RUNNING_HEAD_MAX_LENGTH - 1).trimEnd()}…`
    : head
}

/** Serializes text as a CSS string literal, for `content: var(...)`. */
export function toCssString(value: string): string {
  // eslint-disable-next-line no-control-regex
  return `"${value.replace(/[\\"]/g, '\\$&').replace(/[\x00-\x1f\x7f]/g, ' ')}"`
}

/**
 * Loads the face the page furniture is set in (the `--mono` token, bold —
 * see document.css's `@page md-sheet`). Margin boxes are outside the
 * document, so nothing in a plain-prose file would otherwise make the
 * browser fetch it, and the running head and page numbers would print in
 * a fallback face. Never rejects.
 */
export function loadPageFurnitureFont(): Promise<void> {
  const family = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim()
  if (!family || typeof document.fonts?.load !== 'function') return Promise.resolve()
  return document.fonts.load(`700 10px ${family}`).then(
    () => undefined,
    () => undefined,
  )
}

/**
 * Whether the engine lays out `@page` margin boxes (`@top-left`,
 * `@bottom-right`…), which carry the running head and page numbers. Their
 * CSSOM interface, `CSSMarginRule`, shipped together with them (Chromium
 * 131+), so its presence is the feature test. Elsewhere the print root keeps
 * the zero-margin layout, whose page spacing lives in the document's own
 * padding — see document.css.
 */
export function supportsPageMarginBoxes(): boolean {
  return typeof window !== 'undefined' && 'CSSMarginRule' in window
}
