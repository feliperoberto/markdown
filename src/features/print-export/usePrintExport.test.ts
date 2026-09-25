import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/preact'
import { usePrintExport } from './usePrintExport'

// jsdom implements neither `window.print()` nor `document.fonts`, so both
// are stubbed; `beforeprint`/`afterprint` are dispatched by hand, the way
// the browser fires them around its print dialog.
function printDoc(): HTMLElement | null {
  return document.querySelector('body > .print-root > .preview-content.print-document')
}

describe('usePrintExport', () => {
  let printSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.title = 'Markdown'
    printSpy = vi.fn()
    vi.stubGlobal('print', printSpy)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    // @ts-expect-error cleaning up a test-only stub
    delete document.fonts
  })

  it('appends an empty print root directly under <body> on mount', () => {
    renderHook(() => usePrintExport({ content: '# Olá', fileName: 'nota.md' }))

    const root = document.body.querySelector(':scope > .print-root')
    expect(root).not.toBeNull()
    expect(root?.children).toHaveLength(1)
    expect(printDoc()?.innerHTML).toBe('')
    expect(printDoc()?.id).toBe('')
  })

  it('removes the print root on unmount', () => {
    const { unmount } = renderHook(() => usePrintExport({ content: 'x', fileName: 'x.md' }))
    unmount()

    expect(document.querySelector('.print-root')).toBeNull()
  })

  it('fills sanitized HTML on beforeprint (native Ctrl/Cmd+P) and clears it on afterprint', () => {
    renderHook(() =>
      usePrintExport({
        content: '# Título\n\n<script>alert(1)</script>',
        fileName: 'nota.md',
      }),
    )

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    const html = printDoc()?.innerHTML ?? ''
    expect(html).toContain('<h1')
    expect(html).toContain('Título')
    expect(html).not.toContain('<script')

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(printDoc()?.innerHTML).toBe('')
  })

  it('uses the latest content without re-binding (independent of editor view)', () => {
    const { rerender } = renderHook(
      ({ content }) => usePrintExport({ content, fileName: 'nota.md' }),
      { initialProps: { content: 'antigo' } },
    )
    rerender({ content: 'novo' })

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })

    expect(printDoc()?.textContent).toContain('novo')
    expect(printDoc()?.textContent).not.toContain('antigo')
  })

  it('does not render the markdown before printing', () => {
    const { rerender } = renderHook(
      ({ content }) => usePrintExport({ content, fileName: 'nota.md' }),
      { initialProps: { content: 'a' } },
    )
    rerender({ content: '# b' })

    expect(printDoc()?.innerHTML).toBe('')
  })

  it('swaps document.title to the file name (without .md) and restores it', () => {
    renderHook(() => usePrintExport({ content: 'x', fileName: 'relatorio.md' }))

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(document.title).toBe('relatorio')

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(document.title).toBe('Markdown')
  })

  it('keeps the page title when there is no file name', () => {
    renderHook(() => usePrintExport({ content: '', fileName: '' }))

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(document.title).toBe('Markdown')
  })

  it('printDocument fills the root, swaps the title and calls window.print()', async () => {
    const { result } = renderHook(() =>
      usePrintExport({ content: '**negrito**', fileName: 'a.md' }),
    )

    printSpy.mockImplementation(() => {
      // The browser fires beforeprint as print() opens its dialog; the
      // button path already swapped the title, so it must not swap twice.
      window.dispatchEvent(new Event('beforeprint'))
      expect(printDoc()?.innerHTML).toContain('<strong>negrito</strong>')
      expect(document.title).toBe('a')
      window.dispatchEvent(new Event('afterprint'))
    })

    await act(async () => {
      await result.current.printDocument()
    })

    expect(printSpy).toHaveBeenCalledOnce()
    expect(document.title).toBe('Markdown')
    expect(printDoc()?.innerHTML).toBe('')
  })

  it('printDocument keeps its already-decoded nodes through the beforeprint print() fires', async () => {
    const { result } = renderHook(() =>
      usePrintExport({ content: '![x](https://example.com/x.png)', fileName: 'a.md' }),
    )

    let imgBeforePrint: Element | null | undefined
    printSpy.mockImplementation(() => {
      imgBeforePrint = printDoc()?.querySelector('img')
      window.dispatchEvent(new Event('beforeprint'))
      expect(printDoc()?.querySelector('img')).toBe(imgBeforePrint)
      window.dispatchEvent(new Event('afterprint'))
    })

    await act(async () => {
      await result.current.printDocument()
    })

    expect(imgBeforePrint).toBeTruthy()
    expect(printSpy).toHaveBeenCalledOnce()
  })

  it('printDocument does not wait forever on an image that never decodes', async () => {
    vi.useFakeTimers()
    try {
      const decode = vi.fn(() => new Promise<void>(() => {}))
      const original = HTMLImageElement.prototype.decode
      HTMLImageElement.prototype.decode = decode
      try {
        const { result } = renderHook(() =>
          usePrintExport({ content: '![x](https://example.com/x.png)', fileName: 'a.md' }),
        )

        let done = false
        const promise = result.current.printDocument().then(() => {
          done = true
        })
        await vi.advanceTimersByTimeAsync(3000)
        await promise

        expect(decode).toHaveBeenCalled()
        expect(done).toBe(true)
        expect(printSpy).toHaveBeenCalledOnce()
      } finally {
        HTMLImageElement.prototype.decode = original
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('restores a swapped title on unmount', () => {
    const { unmount } = renderHook(() => usePrintExport({ content: 'x', fileName: 'nota.md' }))
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    unmount()

    expect(document.title).toBe('Markdown')
  })
})
