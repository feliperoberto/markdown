/**
 * Print-time adaptations of the rendered document: what "the same document,
 * on paper" needs that CSS alone can't express. Applied only to the print
 * root's own render (never the on-screen preview), right after it is filled.
 */

/** Custom property on `<html>` holding the running head, read by `@page` in document.css. */
export const RUNNING_HEAD_PROPERTY = '--print-running-head'

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

/**
 * - Opens every `<details>`: paper can't be clicked, so a collapsed one
 *   would print its summary and silently drop the rest.
 * - Marks links with `data-print-url`, which the print theme appends after
 *   the link text: a link's meaning is where it goes, and paper can't
 *   follow it (the PDF itself keeps the links clickable).
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
