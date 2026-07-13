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
