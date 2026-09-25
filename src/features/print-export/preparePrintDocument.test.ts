import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RUNNING_HEAD_MAX_LENGTH,
  loadPageFurnitureFont,
  preparePrintDocument,
  printableUrl,
  runningHead,
  supportsPageMarginBoxes,
  toCssString,
} from './preparePrintDocument'

function doc(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

function link(href: string, text: string): HTMLAnchorElement {
  return doc(`<a href="${href}">${text}</a>`).querySelector('a')!
}

describe('printableUrl', () => {
  it('discloses an http(s) link whose text is not its URL', () => {
    expect(printableUrl(link('https://example.com/a', 'o exemplo'))).toBe('https://example.com/a')
  })

  it('discloses a mailto link as the bare address', () => {
    expect(printableUrl(link('mailto:a@b.com', 'escreva'))).toBe('a@b.com')
  })

  it.each([
    ['https://example.com', 'https://example.com'],
    ['https://example.com/', 'example.com'],
    ['https://www.example.com/a', 'example.com/a'],
    ['HTTPS://Example.com', 'https://example.com'],
    ['mailto:a@b.com', 'a@b.com'],
  ])('skips %s shown as "%s" (the text already is the URL)', (href, text) => {
    expect(printableUrl(link(href, text))).toBeNull()
  })

  it.each(['#secao', 'notas.md', '/relativo', 'ftp://example.com/x'])(
    'skips a link to %s (nothing useful to print)',
    (href) => {
      expect(printableUrl(link(href, 'texto'))).toBeNull()
    },
  )
})

describe('preparePrintDocument', () => {
  it('opens every <details>, nested ones included', () => {
    const root = doc(
      '<details><summary>a</summary><details><summary>b</summary>x</details></details>',
    )
    preparePrintDocument(root)

    expect([...root.querySelectorAll('details')].every((d) => d.open)).toBe(true)
  })

  it('marks only the links whose destination the reader can’t already see', () => {
    const root = doc(
      '<a href="https://a.example">texto</a> <a href="https://b.example">https://b.example</a> <a href="#x">âncora</a>',
    )
    preparePrintDocument(root)

    const links = root.querySelectorAll('a')
    expect(links[0]?.dataset.printUrl).toBe('https://a.example')
    expect(links[1]?.hasAttribute('data-print-url')).toBe(false)
    expect(links[2]?.hasAttribute('data-print-url')).toBe(false)
  })

  it('ignores a destination the document itself claims (raw HTML)', () => {
    const root = doc(
      '<a href="https://real.example" data-print-url="https://fake.example">x</a>' +
        '<a href="#topo" data-print-url="https://fake.example">y</a>' +
        '<a data-print-url="https://fake.example">z</a>',
    )
    preparePrintDocument(root)

    const links = root.querySelectorAll('a')
    expect(links[0]?.dataset.printUrl).toBe('https://real.example')
    expect(links[1]?.hasAttribute('data-print-url')).toBe(false)
    expect(links[2]?.hasAttribute('data-print-url')).toBe(false)
  })
})

describe('runningHead', () => {
  it('uses the document’s first h1, whitespace-normalized', () => {
    const root = doc('<h2>Antes</h2><h1>  Relatório\n de   campo </h1><h1>Outro</h1>')

    expect(runningHead(root, 'arquivo')).toBe('Relatório de campo')
  })

  it('falls back to the file name without an h1', () => {
    expect(runningHead(doc('<h2>Seção</h2>'), ' notas ')).toBe('notas')
    expect(runningHead(doc('<h1> </h1>'), 'notas')).toBe('notas')
  })

  it('is empty with neither', () => {
    expect(runningHead(doc('<p>x</p>'), '')).toBe('')
  })

  it('shortens a long title with an ellipsis', () => {
    const head = runningHead(doc(`<h1>${'palavra '.repeat(20)}</h1>`), '')

    expect(head.length).toBe(RUNNING_HEAD_MAX_LENGTH)
    expect(head.endsWith('…')).toBe(true)
    expect(head).not.toMatch(/\s…$/)
  })
})

describe('toCssString', () => {
  it('quotes and escapes text for use as a CSS string', () => {
    expect(toCssString('Relatório')).toBe('"Relatório"')
    expect(toCssString('a "b" \\ c')).toBe('"a \\"b\\" \\\\ c"')
    expect(toCssString('a\nb\u0007c')).toBe('"a b c"')
  })
})

describe('supportsPageMarginBoxes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is false where CSSMarginRule is missing (jsdom, and engines without margin boxes)', () => {
    expect(supportsPageMarginBoxes()).toBe(false)
  })

  it('is true where CSSMarginRule exists', () => {
    vi.stubGlobal('CSSMarginRule', class {})
    expect(supportsPageMarginBoxes()).toBe(true)
  })
})

describe('loadPageFurnitureFont', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error cleaning up a test-only stub
    delete document.fonts
  })

  function stubMonoToken(value: string) {
    const real = window.getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = real(el, pseudo)
      if (el !== document.documentElement) return style
      return {
        ...style,
        getPropertyValue: (name: string) => (name === '--mono' ? value : ''),
      } as CSSStyleDeclaration
    })
  }

  it('loads the bold face of the --mono token', async () => {
    const load = vi.fn(() => Promise.resolve([]))
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } })
    stubMonoToken(" 'Courier Prime', monospace ")

    await loadPageFurnitureFont()

    expect(load).toHaveBeenCalledWith("700 10px 'Courier Prime', monospace")
  })

  it('resolves without the font loading API or the token', async () => {
    await expect(loadPageFurnitureFont()).resolves.toBeUndefined()

    const load = vi.fn(() => Promise.resolve([]))
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } })
    stubMonoToken('')
    await expect(loadPageFurnitureFont()).resolves.toBeUndefined()
    expect(load).not.toHaveBeenCalled()
  })

  it('never rejects when the load fails', async () => {
    const load = vi.fn(() => Promise.reject(new Error('offline')))
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } })
    stubMonoToken('monospace')

    await expect(loadPageFurnitureFont()).resolves.toBeUndefined()
  })
})
