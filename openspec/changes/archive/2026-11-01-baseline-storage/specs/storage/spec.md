## ADDED Requirements

### Requirement: Synchronous key/value adapter contract
The storage layer SHALL expose a synchronous `StorageAdapter` with `get` (returns the string or `null`), `set` and `remove`, so feature code does not call `localStorage` directly.

#### Scenario: Missing key reads as null
- **WHEN** `get` is called for a key that was never set
- **THEN** it returns `null`
Covered by: src/lib/storage-adapter.test.ts

#### Scenario: Set then get round-trips and overwrites
- **WHEN** a key is set, then set again with another value
- **THEN** `get` returns the latest value
Covered by: src/lib/storage-adapter.test.ts

### Requirement: localStorage-backed adapter
`localStorageAdapter` SHALL delegate `get`, `set` and `remove` directly to `localStorage` without catching errors.

#### Scenario: Remove deletes, and removing a missing key is a no-op
- **WHEN** `remove` is called on an existing key, then on a key that does not exist
- **THEN** the first key reads as `null` and neither call throws
Covered by: src/lib/storage-adapter.test.ts

#### Scenario: Quota errors propagate to the caller
- **WHEN** `localStorage.setItem` throws (for example a quota error)
- **THEN** `set` rethrows so the caller can decide whether to apply the change
Covered by: none (untested)

### Requirement: Non-persistent memory adapter
`createMemoryStorageAdapter` SHALL return a `StorageAdapter` backed by an in-process map that never touches durable storage, used when IndexedDB holds the user's data but cannot be opened (ADR 0005, decision 6).

#### Scenario: Memory adapter holds values only for the session
- **WHEN** values are set, read and removed on a memory adapter
- **THEN** reads reflect the latest state and nothing is written to `localStorage` or IndexedDB
Covered by: none (untested)

### Requirement: IndexedDB store unavailable is a rejection
`openIndexedDbStore` SHALL reject instead of throwing or hanging when IndexedDB cannot be used, so the caller can fall back (ADR 0005, decision 6).

#### Scenario: No IndexedDB factory
- **WHEN** no factory is passed and the global `indexedDB` is undefined
- **THEN** the promise rejects with an "IndexedDB is not available" error
Covered by: src/lib/idb-kv.test.ts

#### Scenario: Open request never settles
- **WHEN** `open` returns a request that fires neither success nor error within `timeoutMs`
- **THEN** the promise rejects with an "IndexedDB open timed out after <timeoutMs>ms" error
Covered by: src/lib/idb-kv.test.ts

#### Scenario: Open throws synchronously
- **WHEN** `factory.open` throws (for example a SecurityError)
- **THEN** the timer is cleared and the promise rejects with that error
Covered by: src/lib/idb-kv.test.ts

#### Scenario: Open fails via the error event
- **WHEN** the open request fires `error`
- **THEN** the promise rejects with the request's error, or "Failed to open IndexedDB" if none
Covered by: none (untested)

### Requirement: Late open success does not leak a connection
When the open request succeeds after the timeout already rejected, `openIndexedDbStore` SHALL close the resulting connection.

#### Scenario: Success after timeout
- **WHEN** the timeout fires first and `onsuccess` fires later
- **THEN** the late database connection is closed and the caller keeps the earlier rejection
Covered by: none (untested)

### Requirement: Object store creation on first open
On `upgradeneeded`, `openIndexedDbStore` SHALL create the configured object store (database version 1) if it does not already exist.

#### Scenario: Fresh database starts empty
- **WHEN** a store is opened on a new database
- **THEN** `getAll` returns an empty map
Covered by: src/lib/idb-kv.test.ts

### Requirement: Read every entry at boot
`getAll` SHALL return all string-keyed, string-valued entries as a `Map`, ignoring entries whose key or value is not a string.

#### Scenario: Data persists across connections
- **WHEN** a value is written, then the same database is opened again
- **THEN** `getAll` on the new connection returns the written entry
Covered by: src/lib/idb-kv.test.ts

#### Scenario: Non-string entries are skipped
- **WHEN** the store holds a non-string value or key
- **THEN** that entry is absent from the returned map
Covered by: none (untested)

### Requirement: Atomic batched writes
`write` SHALL apply all entries in one readwrite transaction, putting string values and deleting keys whose value is `null`, and resolve only when the transaction completes (ADR 0005).

#### Scenario: Put and delete in one batch
- **WHEN** a batch overwrites key `b` and sets `a` to `null`
- **THEN** `getAll` shows `b` with the new value and no `a`
Covered by: src/lib/idb-kv.test.ts

#### Scenario: Empty batch does nothing
- **WHEN** `write` is called with no entries
- **THEN** it resolves without opening a transaction
Covered by: none (untested)

#### Scenario: Transaction failure rejects
- **WHEN** a request in the transaction fails or the transaction aborts (for example quota)
- **THEN** `write` rejects with the transaction error and no entry of the batch is applied
Covered by: none (untested)

### Requirement: Yield to newer database versions
The open connection SHALL close itself on `versionchange` so another tab running a newer build can upgrade the database (ADR 0003).

#### Scenario: Version change closes the connection
- **WHEN** the database receives a `versionchange` event
- **THEN** the connection is closed
Covered by: none (untested)

### Requirement: In-memory mirror serves reads synchronously
`createMirroredStorageAdapter` SHALL answer `get` from an in-memory copy of the initial snapshot and update that copy immediately on `set` and `remove`, before any durable write settles (ADR 0005, decision 2).

#### Scenario: Initial snapshot is readable immediately
- **WHEN** an adapter is created with an initial map
- **THEN** `get` returns its values synchronously and `null` for unknown keys
Covered by: src/lib/mirrored-storage-adapter.test.ts

#### Scenario: Mutations are visible before the write settles
- **WHEN** `set` and `remove` are called while the durable write is pending
- **THEN** `get` already reflects both
Covered by: src/lib/mirrored-storage-adapter.test.ts

### Requirement: Write-behind with coalescing and no debounce
The mirrored adapter SHALL start a durable write at the first mutation and merge mutations made while it is in flight, per key with the latest value winning, into one follow-up batch (ADR 0005, decision 3).

#### Scenario: Burst of writes
- **WHEN** `set('p')` is called three times and `set('q')` once while the first write is in flight
- **THEN** the first batch contains only `p=1`, and after it completes one batch contains `p=3` and `q`
Covered by: src/lib/mirrored-storage-adapter.test.ts

### Requirement: Removals are queued as deletes only for existing keys
`remove` SHALL queue a delete (`null` value) only when the mirror holds the key.

#### Scenario: Remove existing and unknown keys
- **WHEN** `remove` is called for a present key and for a key that never existed
- **THEN** only one batch with `[key, null]` reaches the store
Covered by: src/lib/mirrored-storage-adapter.test.ts

### Requirement: Failed durable writes are reported and retried
When a durable write rejects, the mirrored adapter SHALL call `onError`, keep the in-memory value, re-queue the failed keys without retrying automatically, and let the next mutation carry them; a newer pending value for the same key SHALL supersede the failed one (ADR 0005, Consequences).

#### Scenario: Failure then retry on next mutation
- **WHEN** a write fails and a later `set` is made
- **THEN** `onError` was called with the error, the value is still readable, and the next batch includes the failed key plus the new one
Covered by: src/lib/mirrored-storage-adapter.test.ts

#### Scenario: Newer value supersedes a failed one
- **WHEN** a write of `a=old` fails while `a=new` is already pending
- **THEN** the next batch carries `a=new` and not `a=old`
Covered by: src/lib/mirrored-storage-adapter.test.ts

### Requirement: Settlement introspection
The mirrored adapter SHALL provide `flush()`, which resolves once queued writes were attempted and does not spin on a persistent failure, and `isSettled()`, which is true only when nothing is queued or in flight.

#### Scenario: Flush waits for queued writes
- **WHEN** writes are queued and `flush()` is awaited
- **THEN** the store has received them
Covered by: src/lib/mirrored-storage-adapter.test.ts

#### Scenario: isSettled reflects pending work
- **WHEN** a write is in flight, and again after it commits
- **THEN** `isSettled()` returns false, then true
Covered by: none (untested)

### Requirement: Projects envelope detection
`isEnvelope` SHALL accept only a plain object with a numeric `schemaVersion` and a plain-object `projects`.

#### Scenario: Valid and invalid shapes
- **WHEN** the input is a well-formed envelope, a legacy raw blob, null, an array, a string version, or lacks `projects`
- **THEN** only the well-formed envelope returns true
Covered by: src/lib/storage-migrations.test.ts

### Requirement: Legacy blob lifted to the current schema
`migrateStoredProjects` SHALL treat an un-versioned blob as schemaVersion 0 and run registered migrations in order up to `CURRENT_SCHEMA_VERSION` (currently 1).

#### Scenario: Legacy blob
- **WHEN** a raw `ProjectsState` is migrated
- **THEN** the result is stamped with the current version and has the same projects
Covered by: src/lib/storage-migrations.test.ts

#### Scenario: Missing or non-object input
- **WHEN** the input is null, undefined or a string
- **THEN** the result is an empty current-version envelope and nothing throws
Covered by: src/lib/storage-migrations.test.ts

#### Scenario: Explicit version 0 envelope
- **WHEN** an envelope with schemaVersion 0 is migrated
- **THEN** it is stamped 1 with projects unchanged
Covered by: src/lib/storage-migrations.test.ts

#### Scenario: Current data is untouched
- **WHEN** an envelope already at the current version is migrated
- **THEN** it is returned equal to the input
Covered by: src/lib/storage-migrations.test.ts

### Requirement: Missing migration stops safely
When no migration is registered for an envelope's version, `migrateStoredProjects` SHALL stop and return the data as-is rather than loop or throw.

#### Scenario: Unknown version
- **WHEN** an envelope with schemaVersion 99 is migrated
- **THEN** it is returned with version 99 and its projects intact
Covered by: src/lib/storage-migrations.test.ts

### Requirement: Future-schema detection
`isFutureSchema` SHALL return true only for a valid envelope whose version is greater than `CURRENT_SCHEMA_VERSION`, so an un-updated tab can read newer data without migrating it (ADR 0003).

#### Scenario: Version comparison
- **WHEN** the input is a newer envelope, a current one, an older one, a legacy blob, null, or a string
- **THEN** only the newer envelope returns true
Covered by: src/lib/storage-migrations.test.ts

### Requirement: TODO: Synchronous throw from a store write escapes the mirror
The mirrored adapter SHALL report a store whose `write` throws synchronously through `onError` instead of throwing out of `set` or `remove`.

#### Scenario: Store write throws synchronously
- **WHEN** `store.write` throws before returning a promise
- **THEN** desired: `onError` is called and `set` returns normally with the mirror updated
- Evidence: src/lib/mirrored-storage-adapter.ts:51-52 calls `store.write(...)` before the `.catch`, and `pending` was already swapped at line 50, so a sync throw would lose the batch and leave `inFlight` unset. `idb-kv.ts` `write` is async, so this cannot happen today.
Covered by: none (untested)

### Requirement: TODO: Stale localStorage wording in migration and adapter comments
Code comments SHALL describe the projects blob as living in the active backend (IndexedDB by default per ADR 0005), not only in `localStorage`.

#### Scenario: Comments match the storage design
- **WHEN** a maintainer reads the module headers
- **THEN** desired: they mention IndexedDB as the primary projects backend
- Evidence: src/lib/storage-migrations.ts:1 says the blob is "persisted in `localStorage`" and src/lib/storage-adapter.ts:1-11 describes a localStorage-only interface "for now" (issue #29), while ADR 0005 moved the projects blob to IndexedDB.
Covered by: none (untested)
