import { describe, expect, it, vi } from 'vitest'
import type { AsyncKeyValueStore } from './idb-kv'
import { createMirroredStorageAdapter } from './mirrored-storage-adapter'

type Batch = ReadonlyArray<readonly [string, string | null]>

// Async store whose writes stay pending until the test releases them, so
// in-flight coalescing can be observed deterministically.
function controllableStore() {
  const batches: Batch[] = []
  const releases: Array<(error?: Error) => void> = []
  const store: AsyncKeyValueStore = {
    getAll: async () => new Map(),
    write: (entries) => {
      batches.push(entries)
      return new Promise<void>((resolve, reject) => {
        releases.push((error) => (error ? reject(error) : resolve()))
      })
    },
  }
  return { store, batches, releases }
}

describe('createMirroredStorageAdapter', () => {
  it('serves the initial snapshot synchronously', () => {
    const { store } = controllableStore()
    const adapter = createMirroredStorageAdapter(store, new Map([['k', 'v']]), vi.fn())

    expect(adapter.get('k')).toBe('v')
    expect(adapter.get('missing')).toBeNull()
  })

  it('reflects set/remove immediately, before the durable write settles', () => {
    const { store } = controllableStore()
    const adapter = createMirroredStorageAdapter(store, new Map([['gone', 'x']]), vi.fn())

    adapter.set('k', 'v')
    adapter.remove('gone')

    expect(adapter.get('k')).toBe('v')
    expect(adapter.get('gone')).toBeNull()
  })

  it('writes the first mutation immediately and coalesces the rest into one follow-up batch', async () => {
    const { store, batches, releases } = controllableStore()
    const adapter = createMirroredStorageAdapter(store, new Map(), vi.fn())

    adapter.set('p', '1')
    adapter.set('p', '2')
    adapter.set('p', '3')
    adapter.set('q', 'x')

    expect(batches).toEqual([[['p', '1']]])
    releases[0]!()
    await vi.waitFor(() => expect(batches).toHaveLength(2))
    expect(batches[1]).toEqual([
      ['p', '3'],
      ['q', 'x'],
    ])
    releases[1]!()
    await adapter.flush()
  })

  it('queues a delete for a removed key', async () => {
    const writes: Batch[] = []
    const store: AsyncKeyValueStore = {
      getAll: async () => new Map(),
      write: async (entries) => void writes.push(entries),
    }
    const adapter = createMirroredStorageAdapter(store, new Map([['k', 'v']]), vi.fn())

    adapter.remove('k')
    adapter.remove('never-existed')
    await adapter.flush()

    expect(writes).toEqual([[['k', null]]])
  })

  it('reports a failed write and retries it with the next mutation', async () => {
    const writes: Batch[] = []
    let fail = true
    const store: AsyncKeyValueStore = {
      getAll: async () => new Map(),
      write: async (entries) => {
        writes.push(entries)
        if (fail) throw new Error('disk full')
      },
    }
    const onError = vi.fn()
    const adapter = createMirroredStorageAdapter(store, new Map(), onError)

    adapter.set('a', '1')
    await adapter.flush()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }))
    // In-memory value survives the failed durable write.
    expect(adapter.get('a')).toBe('1')

    fail = false
    adapter.set('b', '2')
    await adapter.flush()

    expect(writes.at(-1)).toEqual([
      ['a', '1'],
      ['b', '2'],
    ])
  })

  it('does not resurrect a failed value that a newer one superseded', async () => {
    const { store, batches, releases } = controllableStore()
    const onError = vi.fn()
    const adapter = createMirroredStorageAdapter(store, new Map(), onError)

    adapter.set('a', 'old')
    adapter.set('a', 'new')
    releases[0]!(new Error('boom'))
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    expect(batches).toHaveLength(1)
    // The failure re-queues nothing over the pending newer value; the next
    // mutation carries it.
    adapter.set('b', '1')
    await vi.waitFor(() => expect(batches).toHaveLength(2))

    expect(batches[1]).toEqual([
      ['a', 'new'],
      ['b', '1'],
    ])
    releases[1]!()
    await adapter.flush()
  })
})
