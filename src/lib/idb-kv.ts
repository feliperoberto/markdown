// Minimal promise-based key/value store over IndexedDB (issue #120).
//
// Deliberately NOT a general-purpose IndexedDB wrapper: the only consumer
// is the projects blob + its rotating backups (see
// src/features/projects/storage-init.ts), which need exactly three
// operations — read everything once at boot, and apply a batch of
// puts/deletes atomically afterwards. Values are the same JSON strings
// localStorage held, so every parse/migrate code path in storage.ts stays
// byte-for-byte shared between both backends.
//
// Why IndexedDB at all: localStorage is capped at ~5 MiB per origin in
// every major engine, and the projects blob plus N full-copy backups had
// to fit inside it. IndexedDB's quota is a share of free disk (hundreds of
// MiB to GiB), so the same data no longer competes for a few megabytes.

export interface AsyncKeyValueStore {
  /** Reads every entry in the store. Called once, at boot. */
  getAll(): Promise<Map<string, string>>
  /**
   * Applies every `[key, value]` pair in one readwrite transaction — a
   * `null` value deletes the key. All-or-nothing: IndexedDB aborts the
   * whole transaction if any request fails, so a backup rotation can never
   * be left half-shifted.
   */
  write(entries: ReadonlyArray<readonly [string, string | null]>): Promise<void>
}

export interface OpenIndexedDbStoreOptions {
  dbName: string
  storeName: string
  /**
   * Upper bound on how long `indexedDB.open` may take before this gives up.
   * Some engines never settle the request in restricted contexts (older
   * Firefox private windows fired neither success nor error), and the app
   * refuses to render until storage is ready — so a hang must turn into a
   * rejection the caller can fall back from.
   */
  timeoutMs: number
  /** Injected for tests (fake-indexeddb); defaults to the global. */
  factory?: IDBFactory
}

const DB_VERSION = 1

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export function openIndexedDbStore(
  options: OpenIndexedDbStoreOptions,
): Promise<AsyncKeyValueStore> {
  const factory = options.factory ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB)
  if (!factory) return Promise.reject(new Error('IndexedDB is not available'))

  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      reject(new Error(`IndexedDB open timed out after ${options.timeoutMs}ms`))
    }, options.timeoutMs)

    let request: IDBOpenDBRequest
    try {
      request = factory.open(options.dbName, DB_VERSION)
    } catch (error) {
      // Some engines throw synchronously (e.g. a SecurityError when storage
      // is disabled) instead of firing `error`.
      clearTimeout(timer)
      reject(error)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(options.storeName)) {
        db.createObjectStore(options.storeName)
      }
    }
    request.onsuccess = () => {
      clearTimeout(timer)
      if (settled) {
        // Lost the race against the timeout: the caller already fell back,
        // so don't leak an open connection that would block a future
        // version upgrade.
        request.result.close()
        return
      }
      settled = true
      resolve(request.result)
    }
    request.onerror = () => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      reject(request.error ?? new Error('Failed to open IndexedDB'))
    }
  }).then((db) => {
    // A newer build (another tab) bumping DB_VERSION must not be blocked by
    // this connection — close and let it proceed; this tab's next reload
    // picks up the new build anyway (ADR-0003).
    db.onversionchange = () => db.close()
    const { storeName } = options

    return {
      async getAll() {
        const tx = db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const [keys, values] = await Promise.all([
          requestToPromise(store.getAllKeys()),
          requestToPromise(store.getAll()),
        ])
        const result = new Map<string, string>()
        keys.forEach((key, index) => {
          const value: unknown = values[index]
          if (typeof key === 'string' && typeof value === 'string') result.set(key, value)
        })
        return result
      },
      async write(entries) {
        if (entries.length === 0) return
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        for (const [key, value] of entries) {
          if (value === null) store.delete(key)
          else store.put(value, key)
        }
        await transactionDone(tx)
      },
    }
  })
}
