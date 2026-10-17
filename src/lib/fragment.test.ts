import { afterEach, describe, expect, it } from 'vitest'
import {
  createFragmentResolver,
  decodeFragment,
  fragmentHref,
  resolveFragment,
  resolveLinkTarget,
} from './fragment'

function root(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('fragmentHref', () => {
  it('accepts #fragment links on <a> and <area>, ignoring leading whitespace', () => {
    const el = root('<a href="#a"></a><a href=" #b"></a><map><area href="#c"></map>')
    const hrefs = [...el.querySelectorAll('a, area')].map(fragmentHref)
    expect(hrefs).toEqual(['#a', '#b', '#c'])
  })

  it('rejects other links and elements', () => {
    const el = root('<a href="https://x.example/#a"></a><a></a><p href="#a"></p>')
    expect([...el.children].map(fragmentHref)).toEqual([null, null, null])
  })
})

describe('decodeFragment', () => {
  it('decodes a percent-encoded fragment', () => {
    expect(decodeFragment('#introdu%C3%A7%C3%A3o')).toBe('introdução')
  })

  it('returns null for a malformed one, or for a href that is not a fragment', () => {
    expect(decodeFragment('#%E0%A4%A')).toBeNull()
    expect(decodeFragment('conclusao')).toBeNull()
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
    expect(resolveFragment(root('<a name="old"></a>'), 'old')?.tagName).toBe('A')
  })

  it('takes the first element when an id repeats', () => {
    const el = root('<p id="x">1</p><p id="x">2</p>')
    expect(resolveFragment(el, 'x')?.textContent).toBe('1')
  })

  it('only looks inside its root', () => {
    document.body.innerHTML = '<p id="outside"></p>'
    expect(resolveFragment(root('<p></p>'), 'outside')).toBeNull()
  })

  it('resolves an empty or unknown fragment to nothing, even with empty ids and names', () => {
    const el = root('<p id="a"></p><a name=""></a><b id=""></b>')
    expect(resolveFragment(el, '')).toBeNull()
    expect(resolveFragment(el, 'nope')).toBeNull()
  })

  it('serves many lookups from one index', () => {
    const resolve = createFragmentResolver(root('<p id="a"></p><p id="b"></p>'))
    expect([resolve('a')?.id, resolve('b')?.id, resolve('c')]).toEqual(['a', 'b', null])
  })
})

describe('resolveLinkTarget', () => {
  const resolve = createFragmentResolver(root('<p id="here"></p><p id="top"></p>'))

  it('returns the element a fragment names', () => {
    expect(resolveLinkTarget(resolve, 'here')).toBeInstanceOf(HTMLElement)
  })

  it('treats "" and any-case "top" as the top when nothing is named so', () => {
    const none = createFragmentResolver(root(''))
    expect(resolveLinkTarget(none, '')).toBe('top')
    expect(resolveLinkTarget(none, 'TOP')).toBe('top')
    expect(resolveLinkTarget(none, 'topo')).toBeNull()
  })

  it('lets an author-defined #top element win', () => {
    expect(resolveLinkTarget(resolve, 'top')).toBeInstanceOf(HTMLElement)
  })
})
