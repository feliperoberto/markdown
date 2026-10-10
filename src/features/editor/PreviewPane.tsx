import type { JSX } from 'preact/jsx-runtime'
import { HEADING_ID_PREFIX, slugify } from '@/lib/slugify'

export interface PreviewPaneProps {
  html: string
  hidden: boolean
}

const NATIVELY_FOCUSABLE =
  'a[href],summary,button,input,select,textarea,[tabindex],[contenteditable]'

/** First element in the preview with this id (ids may repeat while printing). */
function findById(preview: HTMLElement, id: string): HTMLElement | null {
  if (!id) return null
  for (const el of preview.querySelectorAll<HTMLElement>('[id]')) {
    if (el.id === id) return el
  }
  return null
}

/**
 * Resolves a decoded fragment inside the preview: an exact id, then the
 * generated heading id for GitHub-style links (`#Introdução`), then a legacy
 * `<a name>` anchor.
 */
function resolveFragment(preview: HTMLElement, fragment: string): HTMLElement | null {
  return (
    findById(preview, fragment) ??
    findById(preview, HEADING_ID_PREFIX + slugify(fragment)) ??
    Array.from(preview.querySelectorAll<HTMLElement>('a[name]')).find(
      (el) => el.getAttribute('name') === fragment,
    ) ??
    null
  )
}

/**
 * Scrolls the preview (the sheet is its own scroll box inside an
 * `overflow: hidden` shell) to the element a `#fragment` link points at.
 * Resolution happens at click time, inside the preview only.
 *
 * Only the sheet is scrolled — `scrollIntoView` could also move the
 * clipped ancestors and shift the app chrome. The target lands where the
 * first line of content normally sits (the sheet's top padding). Closed
 * `<details>` ancestors are opened first, as browsers do, and a target that
 * is not natively focusable takes a temporary `tabindex="-1"` so keyboard
 * and screen-reader users arrive at the section too. Scrolling is smooth
 * through the sheet's CSS `scroll-behavior`, which `prefers-reduced-motion`
 * switches off.
 */
export function scrollToFragment(preview: HTMLElement, href: string): void {
  let fragment: string
  try {
    fragment = decodeURIComponent(href.slice(1))
  } catch {
    return
  }

  if (fragment === '' || fragment.toLowerCase() === 'top') {
    // `findById` first: an author-defined #top wins over the browser default.
    const own = fragment ? resolveFragment(preview, fragment) : null
    if (!own) {
      preview.scrollTo({ top: 0 })
      return
    }
  }

  const target = resolveFragment(preview, fragment)
  if (!target) return

  for (let el = target.parentElement; el && el !== preview; el = el.parentElement) {
    if (el instanceof HTMLDetailsElement) el.open = true
  }
  if (target.getClientRects().length === 0) return

  const padding = parseFloat(getComputedStyle(preview).paddingTop) || 0
  const offset = target.getBoundingClientRect().top - preview.getBoundingClientRect().top
  preview.scrollTo({ top: Math.max(0, preview.scrollTop + offset - padding) })

  if (!target.matches(NATIVELY_FOCUSABLE)) {
    target.setAttribute('tabindex', '-1')
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true })
  }
  target.focus({ preventScroll: true })
}

function onPreviewClick(event: JSX.TargetedMouseEvent<HTMLDivElement>): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = (event.target as Element).closest?.('a[href^="#"]')
  const href = link?.getAttribute('href')
  if (href == null || !event.currentTarget.contains(link)) return
  // Always cancel: an unresolved fragment must not change the app's URL or
  // scroll the clipped ancestors.
  event.preventDefault()
  scrollToFragment(event.currentTarget, href)
}

/**
 * Renders the sanitized markdown HTML produced by `renderMarkdown`
 * (issue #18). The sanitize step happens upstream (see `useMarkdownPreview`
 * / `src/lib/markdown.ts`); this component only mounts already-sanitized
 * output, mirroring the prototype's `preview.innerHTML = sanitized` line.
 *
 * In-document `#fragment` links scroll the sheet itself rather than
 * navigating the app (see `scrollToFragment`).
 */
export function PreviewPane({ html, hidden }: PreviewPaneProps): JSX.Element {
  return (
    <div className={`pane preview-pane${hidden ? ' hidden' : ''}`}>
      <div className="preview-wrapper">
        <div className="preview-label">Resultado</div>
        {/* content is sanitized via DOMPurify in renderMarkdown() before reaching this component */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegated: the clickable elements are the rendered <a> links, which are natively keyboard-operable */}
        <div
          className="preview-content"
          id="preview"
          onClick={onPreviewClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
