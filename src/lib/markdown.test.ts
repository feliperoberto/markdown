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
    expect(html).toContain('<a href="https://example.com">link</a>')
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
})
