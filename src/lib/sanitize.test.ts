import { describe, expect, it } from 'vitest'
import { escapeHtml, sanitizeNameSegment } from './sanitize'

describe('escapeHtml', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    )
  })

  it('escapes ampersands and quotes', () => {
    expect(escapeHtml(`Tom & Jerry's "great" day`)).toBe(
      'Tom &amp; Jerry&#39;s &quot;great&quot; day',
    )
  })

  it('leaves plain text untouched', () => {
    expect(escapeHtml('notes.md')).toBe('notes.md')
  })
})

describe('sanitizeNameSegment', () => {
  // Regression test for issue #27: a ZIP entry path-traversal attempt must
  // not be able to escape the intended project/file structure.
  it('strips path separators to neutralize path-traversal attempts', () => {
    expect(sanitizeNameSegment('../../etc/passwd')).toBe('etcpasswd')
  })

  it('strips backslashes as well as forward slashes', () => {
    expect(sanitizeNameSegment('..\\..\\windows\\system32')).toBe('windowssystem32')
  })

  it('strips leading dots (hidden/relative segments)', () => {
    expect(sanitizeNameSegment('...hidden')).toBe('hidden')
  })

  it('strips control characters (NUL, other 0x00-0x1f bytes, and DEL/0x7f)', () => {
    expect(sanitizeNameSegment('bad\x00na\x1fme\x7f')).toBe('badname')
  })

  it('preserves ordinary internal whitespace', () => {
    expect(sanitizeNameSegment('bad name')).toBe('bad name')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeNameSegment('  spaced out  ')).toBe('spaced out')
  })

  it('does not strip HTML metacharacters (escapeHtml handles that at render time)', () => {
    expect(sanitizeNameSegment('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
  })

  it('preserves a normal, already-safe file name unchanged', () => {
    expect(sanitizeNameSegment('My Project')).toBe('My Project')
  })
})
