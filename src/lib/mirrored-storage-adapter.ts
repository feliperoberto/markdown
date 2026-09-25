import type { AsyncKeyValueStore } from './idb-kv'
import type { StorageAdapter } from './storage-adapter'

// Synchronous `StorageAdapter` facade over an asynchronous store (issue
// #120: moving the projects blob to IndexedDB).
//
// Every call site in storage.ts/useProjects.ts is synchronous and built on
// "read what you just wrote" semantics (e.g. backup rotation reads key N
// right after writing key N-1). Rather than turn that whole chain async,
// the entire store is read into an in-memory mirror once at boot; after
// that, `get` answers from the mirror, and `set`/`remove` update the mirror
// immediately and queue a write-behind to the durable store.
//
// Write-behind policy — no debounce, only coalescing: the first mutation
// starts a transaction right away; mutations arriving while it is in
// flight are coalesced per key (latest value wins) into the NEXT single
// transaction. So a burst of keystrokes costs at most two transactions in
// flight-order, and the window in which a just-typed character exists only
// in memory is one IndexedDB commit (single-digit milliseconds for a
// typical blob), not a debounce interval.
//
// Tradeoff vs localStorage (documented in ADR-0005): a durable write can
// now fail AFTER the synchronous `set` returned, so the caller can't gate
// its UI update on it. Failures are reported through `onError` instead, and
// the failed keys are re-queued so the next mutation retries them — unless
// a newer value for the same key has already been queued, which supersedes
// the failed one.

export interface MirroredStorageAdapter extends StorageAdapter {
  /** Resolves once every queued write has been attempted. */
  flush(): Promise<void>
}

export function createMirroredStorageAdapter(
  store: AsyncKeyValueStore,
  initial: ReadonlyMap<string, string>,
  onError: (error: unknown) => void,
): MirroredStorageAdapter {
  const mirror = new Map(initial)
  // Keys changed since the last write started; `null` means "delete".
  let pending = new Map<string, string | null>()
  let inFlight: Promise<void> | null = null

  function drain(): Promise<void> {
    if (inFlight) return inFlight
    if (pending.size === 0) return Promise.resolve()
    const batch = pending
    pending = new Map()
    inFlight = store
      .write(Array.from(batch.entries()))
      .catch((error: unknown) => {
        for (const [key, value] of batch) {
          if (!pending.has(key)) pending.set(key, value)
        }
        onError(error)
        // Don't loop on a persistent failure (quota, disk full, a revoked
        // origin): leave the re-queued keys for the next mutation to retry.
        return 'failed' as const
      })
      .then((outcome) => {
        inFlight = null
        if (outcome !== 'failed' && pending.size > 0) return drain()
      })
    return inFlight
  }

  function queue(key: string, value: string | null): void {
    pending.set(key, value)
    void drain()
  }

  return {
    get(key) {
      return mirror.get(key) ?? null
    },
    set(key, value) {
      mirror.set(key, value)
      queue(key, value)
    },
    remove(key) {
      if (!mirror.has(key)) return
      mirror.delete(key)
      queue(key, null)
    },
    async flush() {
      // Loop because a drain can re-arm itself with writes queued while it
      // was in flight.
      while (inFlight || pending.size > 0) {
        const before = pending.size
        await drain()
        // A failed batch re-queues itself without retrying; stop instead of
        // spinning on the same failure.
        if (!inFlight && pending.size > 0 && pending.size >= before) return
      }
    },
  }
}
