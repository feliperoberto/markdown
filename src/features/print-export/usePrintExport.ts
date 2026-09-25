import { useCallback, useEffect, useRef } from 'preact/hooks'
import { renderMarkdown } from '@/lib/markdown'

/** Class of the print-only container appended directly under `<body>` (styled by global print CSS). */
export const PRINT_ROOT_CLASS = 'print-root'
/** Class of the single document node inside the print root; reuses `.preview-content` typography. */
export const PRINT_DOCUMENT_CLASS = 'print-document'

/**
 * Upper bound on how long `printDocument()` waits for fonts/images before
 * opening the print dialog anyway — a slow or broken remote `<img>` must
 * never leave the button looking dead.
 */
export const PRINT_ASSET_TIMEOUT_MS = 3000

export interface UsePrintExportOptions {
  /** Current markdown source; only rendered at print time. */
  content: string
  /** Name the saved PDF should get (a trailing `.md` is stripped). Empty = keep the page title. */
  fileName: string
}

export interface UsePrintExportResult {
  /** Renders the current content into the print root, waits for assets, then calls `window.print()`. */
  printDocument: () => Promise<void>
}

function stripMarkdownExtension(name: string): string {
  return name.replace(/\.md$/i, '')
}

function waitForAssets(root: HTMLElement): Promise<void> {
  const fontsReady = document.fonts?.ready.then(() => undefined) ?? Promise.resolve()
  const images = Array.from(root.querySelectorAll('img')).map((img) =>
    typeof img.decode === 'function' ? img.decode().catch(() => undefined) : undefined,
  )
  const assets = Promise.all([fontsReady.catch(() => undefined), ...images]).then(() => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, PRINT_ASSET_TIMEOUT_MS)
  })
  return Promise.race([assets, timeout]).finally(() => clearTimeout(timer))
}

/**
 * "Export PDF" via the browser's print dialog. Owns a dedicated
 * `<div class="print-root">` appended directly to `document.body` (outside
 * `#app`), so print CSS can hide the whole app and show only the rendered
 * markdown — regardless of whether the editor is in edit, split or preview
 * view (the on-screen preview may not even be rendered, see
 * useMarkdownPreview's `skip`).
 *
 * The markdown is rendered into the print root ONLY at print time (button
 * click or the native `beforeprint` from Ctrl/Cmd+P), never per keystroke,
 * preserving useMarkdownPreview's rationale of not re-running
 * marked+DOMPurify on the full document when nobody is looking at it. It is
 * cleared again on `afterprint`.
 *
 * While printing, `document.title` is swapped to the file name, since
 * browsers use the title as the default "Save as PDF" file name.
 */
export function usePrintExport({ content, fileName }: UsePrintExportOptions): UsePrintExportResult {
  const contentRef = useRef(content)
  const fileNameRef = useRef(fileName)
  contentRef.current = content
  fileNameRef.current = fileName

  const documentRef = useRef<HTMLDivElement | null>(null)
  // Title to restore on afterprint; non-null means a swap is in effect, so
  // the button path followed by the browser's own beforeprint doesn't swap
  // twice (and then "restore" to the file name).
  const savedTitleRef = useRef<string | null>(null)
  // Set while printDocument hands off to window.print(): it already filled
  // the print root and waited for its images, so the beforeprint that
  // print() fires must not re-render — that would replace the decoded
  // <img> nodes with fresh, unloaded ones and defeat the wait.
  const skipBeforePrintFillRef = useRef(false)

  useEffect(() => {
    const root = document.createElement('div')
    root.className = PRINT_ROOT_CLASS
    const doc = document.createElement('div')
    doc.className = `preview-content ${PRINT_DOCUMENT_CLASS}`
    root.appendChild(doc)
    document.body.appendChild(root)
    documentRef.current = doc

    return () => {
      root.remove()
      documentRef.current = null
      if (savedTitleRef.current !== null) {
        document.title = savedTitleRef.current
        savedTitleRef.current = null
      }
    }
  }, [])

  const fill = useCallback(() => {
    const doc = documentRef.current
    if (doc) doc.innerHTML = renderMarkdown(contentRef.current)
  }, [])

  const swapTitle = useCallback(() => {
    if (savedTitleRef.current !== null) return
    const name = stripMarkdownExtension(fileNameRef.current.trim())
    if (!name) return
    savedTitleRef.current = document.title
    document.title = name
  }, [])

  const restore = useCallback(() => {
    if (documentRef.current) documentRef.current.innerHTML = ''
    if (savedTitleRef.current !== null) {
      document.title = savedTitleRef.current
      savedTitleRef.current = null
    }
  }, [])

  useEffect(() => {
    const handleBeforePrint = () => {
      if (!skipBeforePrintFillRef.current) fill()
      swapTitle()
    }
    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', restore)
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', restore)
    }
  }, [fill, swapTitle, restore])

  const printDocument = useCallback(async () => {
    fill()
    swapTitle()
    const doc = documentRef.current
    if (doc) await waitForAssets(doc)
    // Cleanup (clearing the print root, restoring the title) happens in
    // the afterprint listener, which fires both where print() blocks and
    // where it returns immediately.
    skipBeforePrintFillRef.current = true
    try {
      window.print()
    } finally {
      skipBeforePrintFillRef.current = false
    }
  }, [fill, swapTitle])

  return { printDocument }
}
