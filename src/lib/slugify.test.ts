import { describe, expect, it } from 'vitest'
import { createSlugger, slugify } from './slugify'

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('keeps accented letters and drops punctuation', () => {
    expect(slugify('Introdução: o começo!')).toBe('introdução-o-começo')
  })

  it('keeps digits, hyphens and underscores', () => {
    expect(slugify('Passo 1 - a_b')).toBe('passo-1---a_b')
  })
})

describe('createSlugger', () => {
  it('suffixes repeated headings in document order', () => {
    const slug = createSlugger()
    expect(slug('Notas')).toBe('notas')
    expect(slug('Notas')).toBe('notas-1')
    expect(slug('Notas')).toBe('notas-2')
  })

  it('does not collide with a literal heading that looks like a suffix', () => {
    const slug = createSlugger()
    expect(slug('A')).toBe('a')
    expect(slug('A 1')).toBe('a-1')
    expect(slug('A')).toBe('a-2')
  })

  it('falls back to a placeholder for headings with no letters', () => {
    const slug = createSlugger()
    expect(slug('!!!')).toBe('secao')
    expect(slug('???')).toBe('secao-1')
  })
})
