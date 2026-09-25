import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { openIndexedDbStore } from './idb-kv'

function open(factory = new IDBFactory()) {
  return openIndexedDbStore({ dbName: 'test', storeName: 'kv', timeoutMs: 1000, factory })
}

describe('openIndexedDbStore', () => {
  it('starts empty and reads back what a batch wrote', async () => {
    const store = await open()
    expect(await store.getAll()).toEqual(new Map())

    await store.write([
      ['a', '1'],
      ['b', '2'],
    ])

    expect(await store.getAll()).toEqual(
      new Map([
        ['a', '1'],
        ['b', '2'],
      ]),
    )
  })

  it('deletes keys written as null and overwrites existing ones', async () => {
    const store = await open()
    await store.write([
      ['a', '1'],
      ['b', '2'],
    ])

    await store.write([
      ['a', null],
      ['b', '3'],
    ])

    expect(await store.getAll()).toEqual(new Map([['b', '3']]))
  })

  it('persists across connections to the same database', async () => {
    const factory = new IDBFactory()
    await (await open(factory)).write([['k', 'v']])

    const reopened = await open(factory)

    expect(await reopened.getAll()).toEqual(new Map([['k', 'v']]))
  })

  it('rejects when IndexedDB is unavailable', async () => {
    await expect(
      openIndexedDbStore({
        dbName: 'test',
        storeName: 'kv',
        timeoutMs: 1000,
        factory: undefined,
      }),
    ).rejects.toThrow('not available')
  })

  it('rejects when open never settles within the timeout', async () => {
    const hangingFactory = {
      open: () => ({}) as IDBOpenDBRequest,
    } as unknown as IDBFactory

    await expect(
      openIndexedDbStore({
        dbName: 'test',
        storeName: 'kv',
        timeoutMs: 10,
        factory: hangingFactory,
      }),
    ).rejects.toThrow('timed out')
  })

  it('rejects when open throws synchronously', async () => {
    const throwingFactory = {
      open: () => {
        throw new DOMException('denied', 'SecurityError')
      },
    } as unknown as IDBFactory

    await expect(
      openIndexedDbStore({
        dbName: 'test',
        storeName: 'kv',
        timeoutMs: 1000,
        factory: throwingFactory,
      }),
    ).rejects.toThrow('denied')
  })
})
