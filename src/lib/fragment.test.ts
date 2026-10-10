import { describe, expect, it } from 'vitest'
import { decodeFragment, isTopFragment, resolveFragment } from './fragment'

function root(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('decodeFragment', () => {
  it('decodes a percent-encoded fragment', () => {
    expect(decodeFragment('#introdu%C3%A7%C3%A3o')).toBe('introdução')
  })

  it('returns null for a malformed one', () => {
    expect(decodeFragment('#%E0%A4%A')).toBeNull()
  })
})

describe('resolveFragment', () => {
  it('finds an exact id first', () => {
    const el = root('<h2 id="user-content-x">a</h2><p id="x">b</p>')
    expect(resolveFragment(el, 'x')?.tagName).toBe('P')
  })

  it('falls back to the generated heading id, ignoring case', () => {
    const el = root('<h2 id="user-content-conclusão">Conclusão</h2>')
    expect(resolveFragment(el, 'Conclusão')?.tagName).toBe('H2')
  })

  it('falls back to a legacy <a name> anchor', () => {
    const el = root('<a name="old"></a>')
    expect(resolveFragment(el, 'old')?.tagName).toBe('A')
  })

  it('only looks inside its root', () => {
    document.body.innerHTML = '<p id="outside"></p>'
    expect(resolveFragment(root('<p></p>'), 'outside')).toBeNull()
    document.body.innerHTML = ''
  })

  it('returns null for an empty or unknown fragment', () => {
    expect(resolveFragment(root('<p id="a"></p>'), '')).toBeNull()
    expect(resolveFragment(root('<p id="a"></p>'), 'nope')).toBeNull()
  })
})

describe('isTopFragment', () => {
  it.each(['', 'top', 'TOP'])('treats %j as the top', (f) => {
    expect(isTopFragment(f)).toBe(true)
  })

  it('does not treat other fragments as the top', () => {
    expect(isTopFragment('topo')).toBe(false)
  })
})
