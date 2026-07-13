import { beforeEach, describe, expect, it } from 'vitest'
import { localStorageAdapter } from './storage-adapter'

describe('localStorageAdapter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null for a key that was never set', () => {
    expect(localStorageAdapter.get('missing')).toBeNull()
  })

  it('set() persists a value that get() can then read back', () => {
    localStorageAdapter.set('foo', 'bar')

    expect(localStorageAdapter.get('foo')).toBe('bar')
  })

  it('set() overwrites a previously stored value', () => {
    localStorageAdapter.set('foo', 'bar')
    localStorageAdapter.set('foo', 'baz')

    expect(localStorageAdapter.get('foo')).toBe('baz')
  })

  it('remove() deletes a stored value', () => {
    localStorageAdapter.set('foo', 'bar')
    localStorageAdapter.remove('foo')

    expect(localStorageAdapter.get('foo')).toBeNull()
  })

  it('remove() on a non-existent key is a no-op (does not throw)', () => {
    expect(() => localStorageAdapter.remove('nope')).not.toThrow()
  })
})
