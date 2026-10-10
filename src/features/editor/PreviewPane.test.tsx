import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/preact'
import { PreviewPane } from './PreviewPane'

const HTML = `
<p>
  <a id="l-exact" href="#user-content-seção-dois">exato</a>
  <a id="l-mixed" href="#Se%C3%A7%C3%A3o-dois">misto</a>
  <a id="l-enc" href="#se%C3%A7%C3%A3o-dois">acento</a>
  <a id="l-name" href="#legacy">legado</a>
  <a id="l-top" href="#top">topo</a>
  <a id="l-bare" href="#">vazio</a>
  <a id="l-missing" href="#nao-existe">nada</a>
  <a id="l-bad" href="#%E0%A4%A">malformado</a>
  <a id="l-details" href="#dentro">dentro</a>
  <a id="l-focus" href="#botao">botao</a>
  <a id="l-ext" href="https://example.com">fora</a>
</p>
<h2 id="user-content-seção-dois">Seção dois</h2>
<a name="legacy">ancora</a>
<details id="det"><summary>Mais</summary><p id="dentro">oculto</p></details>
<button id="botao">ok</button>
`

const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo')

describe('PreviewPane anchor links', () => {
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollTo = vi.fn()
    // jsdom has no layout or Element.scrollTo.
    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollTo,
    })
    // No layout: every element "has a box"; the sheet sits at 100, targets at 500.
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList,
    )
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const top = this.id === 'preview' ? 100 : 500
      return { top } as DOMRect
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    if (original) Object.defineProperty(Element.prototype, 'scrollTo', original)
    else delete (Element.prototype as { scrollTo?: unknown }).scrollTo
  })

  function mount(html = HTML) {
    const view = render(<PreviewPane html={html} hidden={false} />)
    return view.container.querySelector('#preview') as HTMLElement
  }
  const click = (preview: HTMLElement, id: string, init?: MouseEventInit) =>
    fireEvent.click(preview.querySelector(`#${id}`)!, init)

  it('scrolls the sheet to a heading by exact id, focuses it and cancels navigation', () => {
    const preview = mount()

    expect(click(preview, 'l-exact')).toBe(false)

    expect(scrollTo).toHaveBeenCalledWith({ top: 400 })
    expect(document.activeElement?.id).toBe('user-content-seção-dois')
  })

  it('subtracts the sheet padding and the current scroll position', () => {
    const preview = mount()
    preview.style.paddingTop = '40px'
    preview.scrollTop = 10

    click(preview, 'l-exact')

    expect(scrollTo).toHaveBeenCalledWith({ top: 370 })
  })

  it('resolves a mixed-case, accent-encoded link to the generated heading id', () => {
    const preview = mount()

    expect(click(preview, 'l-mixed')).toBe(false)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 400 })
    expect(document.activeElement?.id).toBe('user-content-seção-dois')
  })

  it('resolves a lowercase accent-encoded link', () => {
    const preview = mount()

    click(preview, 'l-enc')

    expect(scrollTo).toHaveBeenCalledWith({ top: 400 })
  })

  it('resolves a raw <a name> anchor', () => {
    const preview = mount()

    expect(click(preview, 'l-name')).toBe(false)
    expect(scrollTo).toHaveBeenCalledWith({ top: 400 })
  })

  it('scrolls to the top for #top and a bare #', () => {
    const preview = mount()

    expect(click(preview, 'l-top')).toBe(false)
    expect(click(preview, 'l-bare')).toBe(false)

    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 0 })
    expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 0 })
  })

  it('cancels unresolved and malformed fragments without scrolling', () => {
    const preview = mount()

    expect(click(preview, 'l-missing')).toBe(false)
    expect(click(preview, 'l-bad')).toBe(false)

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('opens a closed <details> that contains the target', () => {
    const preview = mount()
    const details = preview.querySelector('#det') as HTMLDetailsElement
    expect(details.open).toBe(false)

    click(preview, 'l-details')

    expect(details.open).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith({ top: 400 })
  })

  it('does not scroll when the target has no layout box', () => {
    const preview = mount()
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [] as unknown as DOMRectList,
    )

    expect(click(preview, 'l-exact')).toBe(false)

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('leaves the tabindex of a natively focusable target alone', () => {
    const preview = mount()
    const button = preview.querySelector('#botao') as HTMLElement

    click(preview, 'l-focus')

    expect(button.hasAttribute('tabindex')).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  it('keeps an existing tabindex and removes only the one it added, on blur', () => {
    const preview = mount()
    const heading = preview.querySelector('#user-content-seção-dois') as HTMLElement

    click(preview, 'l-exact')
    expect(heading.getAttribute('tabindex')).toBe('-1')
    heading.blur()
    expect(heading.hasAttribute('tabindex')).toBe(false)

    heading.setAttribute('tabindex', '0')
    click(preview, 'l-exact')
    heading.blur()
    expect(heading.getAttribute('tabindex')).toBe('0')
  })

  it('leaves external links to the browser', () => {
    const preview = mount()

    expect(click(preview, 'l-ext')).toBe(true)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does not hijack modified clicks (open in new tab)', () => {
    const preview = mount()

    expect(click(preview, 'l-exact', { ctrlKey: true })).toBe(true)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
