// Minimal storage-adapter interface.
//
// Features should depend on this interface rather than calling
// `localStorage` directly, so persistence can later be swapped for the
// versioned/migrated storage layer being built in issue #29
// ("Introduce a storage schema version and migration layer") without
// touching feature code — only `localStorageAdapter` (or the default
// export consumers use) needs to change.
//
// This is intentionally NOT the full migration/versioning layer from #29;
// it is a thin, synchronous key/value contract backed by `localStorage`
// for now.
export interface StorageAdapter {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/**
 * Non-persistent adapter. Used for the projects blob only when its durable
 * home (IndexedDB) is known to hold the user's data but can't be opened this
 * session — writing a freshly seeded state anywhere durable would risk
 * shadowing or overwriting the real one (see storage-init.ts).
 */
export function createMemoryStorageAdapter(): StorageAdapter {
  const values = new Map<string, string>()
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  }
}

export const localStorageAdapter: StorageAdapter = {
  get(key) {
    return localStorage.getItem(key)
  },
  set(key, value) {
    localStorage.setItem(key, value)
  },
  remove(key) {
    localStorage.removeItem(key)
  },
}
