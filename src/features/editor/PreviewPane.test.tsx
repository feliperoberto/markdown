import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/preact'
import { renderMarkdown } from '@/lib/markdown'
import { PreviewPane } from './PreviewPane'

const DOC =
  '[ir](#seção-dois) [fora](https://example.com) [nada](#nao-existe)\n\n# Um\n\n## Seção dois'

describe('PreviewPane anchor links', () => {
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollTo = vi.fn()
    // jsdom has no layout or Element.scrollTo.
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo
  })
  afterEach(cleanup)

  function mount() {
    const view = render(<PreviewPane html={renderMarkdown(DOC)} hidden={false} />)
    return view.container.querySelector('#preview') as HTMLElement
  }

  it('scrolls the sheet to the heading, focuses it and cancels navigation', () => {
    const preview = mount()
    const link = preview.querySelector('a[href^="#user-content-se"]') as HTMLElement

    const notCancelled = fireEvent.click(link)

    expect(notCancelled).toBe(false)
    expect(scrollTo).toHaveBeenCalledOnce()
    expect(document.activeElement?.id).toBe('user-content-seção-dois')
  })

  it('leaves external links to the browser', () => {
    const preview = mount()

    const notCancelled = fireEvent.click(preview.querySelector('a[href^="https"]')!)

    expect(notCancelled).toBe(true)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does nothing for a fragment with no target', () => {
    const preview = mount()

    const notCancelled = fireEvent.click(
      preview.querySelector('a[href="#user-content-nao-existe"]')!,
    )

    expect(notCancelled).toBe(true)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does not hijack modified clicks (open in new tab)', () => {
    const preview = mount()

    fireEvent.click(preview.querySelector('a[href^="#user-content-se"]')!, { ctrlKey: true })

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
