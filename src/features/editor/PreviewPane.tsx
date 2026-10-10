import type { JSX } from 'preact/jsx-runtime'

export interface PreviewPaneProps {
  html: string
  hidden: boolean
}

/**
 * Scrolls the preview (the sheet is its own scroll box inside an
 * `overflow: hidden` shell) to the element a `#fragment` link points at.
 * Returns whether it handled the click: a link with no target in the
 * preview is left to the browser.
 *
 * Only the sheet is scrolled — `scrollIntoView` could also move the
 * clipped ancestors and shift the app chrome. The target lands where the
 * first line of content normally sits (the sheet's top padding). It takes
 * focus, so keyboard and screen-reader users arrive at the section too.
 * Scrolling is smooth through the sheet's CSS `scroll-behavior`, which
 * `prefers-reduced-motion` switches off.
 */
export function scrollToFragment(preview: HTMLElement, href: string): boolean {
  let id: string
  try {
    id = decodeURIComponent(href.slice(1))
  } catch {
    return false
  }
  const target = id ? preview.ownerDocument.getElementById(id) : null
  if (!target || !preview.contains(target)) return false

  const padding = parseFloat(getComputedStyle(preview).paddingTop) || 0
  const offset = target.getBoundingClientRect().top - preview.getBoundingClientRect().top
  preview.scrollTo({ top: Math.max(0, preview.scrollTop + offset - padding) })

  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
  return true
}

function onPreviewClick(event: JSX.TargetedMouseEvent<HTMLDivElement>): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = (event.target as Element).closest?.('a[href^="#"]')
  const href = link?.getAttribute('href')
  if (!href || !event.currentTarget.contains(link)) return
  if (scrollToFragment(event.currentTarget, href)) event.preventDefault()
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
