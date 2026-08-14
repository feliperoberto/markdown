import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleDriveSyncProvider } from './google-drive-provider'

/**
 * Shared mutable state the `./google-identity` mock below reads/writes.
 * Declared via `vi.hoisted` so it exists before `vi.mock`'s factory runs
 * (factories are hoisted above the rest of the module) — a plain
 * module-level `let` referenced inside the factory would hit a TDZ error.
 * `configs` records every `initTokenClient` call's `prompt` (so tests can
 * assert silent vs interactive acquisition); `mode` lets a test force the
 * next `requestAccessToken()` to report failure via `error_callback`
 * instead of succeeding via `callback` — or, for `'hang'`, to invoke
 * NEITHER callback, modeling the real-world GIS quirk that motivated
 * wrapping every silent acquisition in a timeout.
 */
const tokenClientState = vi.hoisted(() => ({
  configs: [] as Array<{ prompt?: string }>,
  mode: 'success' as 'success' | 'error' | 'hang',
}))

// Never hit real Google endpoints in tests: the GIS script loader resolves
// synchronously with a fake token instead of any real popup/redirect flow.
vi.mock('./google-identity', () => ({
  loadGoogleIdentity: vi.fn().mockResolvedValue({
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          prompt?: string
          callback: (response: {
            access_token?: string
            expires_in?: number
            error?: string
          }) => void
          error_callback?: (error: { type?: string; message?: string }) => void
        }) => {
          tokenClientState.configs.push({ prompt: config.prompt })
          return {
            requestAccessToken: () => {
              if (tokenClientState.mode === 'hang') {
                // Deliberately invokes neither callback — see the note on
                // `tokenClientState` above.
                return
              }
              if (tokenClientState.mode === 'error') {
                config.error_callback?.({ type: 'popup_failed_to_open' })
              } else {
                config.callback({ access_token: 'fake-token', expires_in: 3600 })
              }
            },
          }
        },
        revoke: (_token: string, done: () => void) => done(),
      },
    },
  }),
  isGoogleIdentityAvailable: () => true,
}))

const FILES_LIST_URL = 'https://www.googleapis.com/drive/v3/files?'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

/** Routes a stubbed `fetch` by URL prefix so each test can script per-endpoint responses. */
function stubFetch(handlers: Record<string, () => Promise<Response> | Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      for (const [prefix, handler] of Object.entries(handlers)) {
        if (url.startsWith(prefix)) return handler()
      }
      throw new Error(`Unmocked fetch: ${url}`)
    }),
  )
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'status',
    json: async () => body,
  } as Response
}

async function connectedProvider(): Promise<GoogleDriveSyncProvider> {
  const provider = new GoogleDriveSyncProvider()
  localStorage.setItem('driveClientId', 'real-client-id.apps.googleusercontent.com')
  stubFetch({ [USERINFO_URL]: () => jsonResponse({ name: 'Test User' }) })
  await provider.connect()
  return provider
}

describe('GoogleDriveSyncProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    tokenClientState.configs = []
    tokenClientState.mode = 'success'
  })

  describe('findDriveFile via uploadSnapshot — res.ok handling', () => {
    // Regression test: findDriveFile had no res.ok check, so a non-2xx
    // files.list response (transient rate-limit/5xx — not necessarily an
    // auth failure) was treated as "no file exists", and uploadSnapshot
    // POSTed a brand-new backup instead of PATCHing the real one,
    // silently accumulating duplicate backups in appDataFolder.
    it('does not create a duplicate backup when files.list returns a non-2xx response', async () => {
      const provider = await connectedProvider()
      const postCalls: string[] = []

      stubFetch({
        'https://www.googleapis.com/drive/v3/files?': () =>
          jsonResponse({ error: { message: 'rate limited' } }, { ok: false, status: 429 }),
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart': () => {
          postCalls.push('POST create')
          return jsonResponse({ id: 'new-file-id' })
        },
        'https://www.googleapis.com/upload/drive/v3/files/': () => {
          postCalls.push('PATCH update')
          return jsonResponse({ id: 'existing-file-id' })
        },
      })

      await expect(provider.push({ projects: { A: {} } })).rejects.toThrow()

      // Neither branch of uploadSnapshot should have run — the whole
      // upload must fail fast rather than silently creating a duplicate.
      expect(postCalls).toEqual([])
    })

    it('throws a message derived from the error body on a non-2xx files.list response', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () =>
          jsonResponse({ error: { message: 'quota exceeded' } }, { ok: false, status: 403 }),
      })

      await expect(provider.push({ projects: {} })).rejects.toThrow(/quota exceeded/)
    })
  })

  describe('uploadSnapshot bookkeeping', () => {
    // Regression test: projectsLastModified was previously written ONLY by
    // the auto-sync tick, never by a manual sync — so after "Sincronizar"
    // the next auto-sync tick saw a stale hash and redundantly re-uploaded
    // identical data. Bookkeeping is now centralized in uploadSnapshot, so
    // a manual push() records both keys.
    it('records lastDriveSync and projectsLastModified after a successful manual push', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () => jsonResponse({ files: [] }),
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart': () =>
          jsonResponse({ id: 'new-file-id' }),
      })

      expect(localStorage.getItem('projectsLastModified')).toBeNull()

      await provider.push({ projects: { A: {} } })

      expect(localStorage.getItem('lastDriveSync')).not.toBeNull()
      expect(localStorage.getItem('projectsLastModified')).not.toBeNull()
    })

    it('PATCHes (not POSTs) when a backup file already exists', async () => {
      const provider = await connectedProvider()
      const calls: string[] = []
      stubFetch({
        [FILES_LIST_URL]: () =>
          jsonResponse({ files: [{ id: 'existing-id', name: 'x', modifiedTime: 't' }] }),
        'https://www.googleapis.com/upload/drive/v3/files/existing-id?uploadType=media': () => {
          calls.push('PATCH')
          return jsonResponse({ id: 'existing-id' })
        },
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart': () => {
          calls.push('POST')
          return jsonResponse({ id: 'new-id' })
        },
      })

      await provider.push({ projects: {} })

      expect(calls).toEqual(['PATCH'])
    })

    // Regression coverage for the tombstones wiring (issue: a renamed/
    // deleted file reappearing as a duplicate after sync) — `push` must
    // actually upload `snapshot.tombstones`, not just `snapshot.projects`,
    // or a deletion recorded locally never reaches Drive for another
    // device to see.
    it('uploads snapshot.tombstones alongside projects', async () => {
      const provider = await connectedProvider()
      let uploadedBody: string | null = null
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          // Routes to the PATCH branch (an existing file), whose body is
          // the raw JSON Blob — the POST/multipart "create" branch wraps it
          // in a FormData instead, which isn't what this test needs to
          // inspect.
          if (url.startsWith(FILES_LIST_URL)) {
            return jsonResponse({ files: [{ id: 'existing-id', name: 'x', modifiedTime: 't' }] })
          }
          if (
            url.startsWith(
              'https://www.googleapis.com/upload/drive/v3/files/existing-id?uploadType=media',
            )
          ) {
            uploadedBody = await (init?.body as Blob).text()
            return jsonResponse({ id: 'existing-id' })
          }
          throw new Error(`Unmocked fetch: ${url}`)
        }),
      )

      await provider.push({
        projects: { A: {} },
        tombstones: { '["A","old"]': '2026-01-01T00:00:00.000Z' },
      })

      const uploaded = JSON.parse(uploadedBody as unknown as string)
      expect(uploaded.tombstones).toEqual({ '["A","old"]': '2026-01-01T00:00:00.000Z' })
    })
  })

  describe('pull', () => {
    // A first-ever sync (nothing uploaded yet) is an expected state, not
    // an error — the caller's reconcile+push resolves it, so pull()
    // resolves to null rather than throwing/toasting a "not found" error.
    it('resolves to null when no backup file exists yet', async () => {
      const provider = await connectedProvider()
      stubFetch({ [FILES_LIST_URL]: () => jsonResponse({ files: [] }) })

      await expect(provider.pull()).resolves.toBeNull()
    })

    // Regression test: res.json() on the backup download had no
    // try/catch, so a truncated/corrupted backup file raised a raw
    // SyntaxError ("Unexpected token…") instead of the clear
    // "Formato de backup inválido" message a missing `projects` field
    // already produced.
    it('rejects with a clear message when the backup body is not valid JSON', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () =>
          jsonResponse({ files: [{ id: 'file-id', name: 'x', modifiedTime: 't' }] }),
        'https://www.googleapis.com/drive/v3/files/file-id?alt=media': () =>
          ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => {
              throw new SyntaxError('Unexpected token')
            },
          }) as unknown as Response,
      })

      await expect(provider.pull()).rejects.toThrow('Formato de backup inválido')
    })

    it('rejects with a clear message when the backup is missing a `projects` field', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () =>
          jsonResponse({ files: [{ id: 'file-id', name: 'x', modifiedTime: 't' }] }),
        'https://www.googleapis.com/drive/v3/files/file-id?alt=media': () => jsonResponse({}),
      })

      await expect(provider.pull()).rejects.toThrow('Formato de backup inválido')
    })

    it('resolves with the projects payload from a well-formed backup', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () =>
          jsonResponse({ files: [{ id: 'file-id', name: 'x', modifiedTime: 't' }] }),
        'https://www.googleapis.com/drive/v3/files/file-id?alt=media': () =>
          jsonResponse({ version: 1, projects: { A: { f: { name: 'f' } } } }),
      })

      await expect(provider.pull()).resolves.toEqual({ projects: { A: { f: { name: 'f' } } } })
    })

    // Regression coverage for the tombstones wiring, symmetric with the
    // upload test above — a backup written by an older build has no
    // `tombstones` field at all, and pull() must surface that as
    // `undefined` (the caller treats it as "nothing to merge in"), not
    // throw or silently coerce it into something else.
    it('resolves with tombstones from a backup that has them, and undefined for one that does not', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () =>
          jsonResponse({ files: [{ id: 'file-id', name: 'x', modifiedTime: 't' }] }),
        'https://www.googleapis.com/drive/v3/files/file-id?alt=media': () =>
          jsonResponse({
            version: 1,
            projects: { A: {} },
            tombstones: { '["A","old"]': '2026-01-01T00:00:00.000Z' },
          }),
      })

      await expect(provider.pull()).resolves.toEqual({
        projects: { A: {} },
        tombstones: { '["A","old"]': '2026-01-01T00:00:00.000Z' },
      })

      stubFetch({
        [FILES_LIST_URL]: () =>
          jsonResponse({ files: [{ id: 'file-id', name: 'x', modifiedTime: 't' }] }),
        'https://www.googleapis.com/drive/v3/files/file-id?alt=media': () =>
          jsonResponse({ version: 1, projects: { A: {} } }),
      })

      const result = await provider.pull()
      expect(result?.tombstones).toBeUndefined()
    })
  })

  describe('startAutoSync', () => {
    // Regression-shaped test for the freshness-sync change: a background
    // tick used to blindly re-upload whatever `getSnapshot()` returned,
    // which could clobber a newer remote edit made by another device.
    // It must now pull the remote snapshot and run it through the
    // caller-supplied `reconcile` before pushing, exactly like the manual
    // "Sincronizar" button.
    it('pulls and reconciles the remote snapshot before pushing, instead of blindly uploading local state', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () =>
          jsonResponse({ files: [{ id: 'file-id', name: 'x', modifiedTime: 't' }] }),
        'https://www.googleapis.com/drive/v3/files/file-id?alt=media': () =>
          jsonResponse({ version: 1, projects: { Remote: {} } }),
        'https://www.googleapis.com/upload/drive/v3/files/file-id?uploadType=media': () =>
          jsonResponse({ id: 'file-id' }),
      })

      const reconcile = vi.fn((remote: { projects: Record<string, unknown> } | null) => ({
        projects: { Merged: {}, ...(remote?.projects ?? {}) },
      }))

      vi.useFakeTimers()
      try {
        provider.startAutoSync(() => ({ projects: { Local: {} } }), reconcile)
        await vi.advanceTimersByTimeAsync(60_000)
      } finally {
        provider.stopAutoSync()
        vi.useRealTimers()
      }

      expect(reconcile).toHaveBeenCalledWith({ projects: { Remote: {} } })
    })
  })

  describe('getStatus — NaN guard', () => {
    // Regression test: a corrupt/non-numeric lastDriveSync value made
    // parseInt() return NaN, which getStatus() previously surfaced
    // verbatim as lastSyncedAt: NaN.
    it('reports lastSyncedAt as null when the stored value is not numeric', () => {
      localStorage.setItem('lastDriveSync', 'not-a-number')
      const provider = new GoogleDriveSyncProvider()

      expect(provider.getStatus().lastSyncedAt).toBeNull()
    })

    it('reports lastSyncedAt as null when nothing is stored', () => {
      const provider = new GoogleDriveSyncProvider()

      expect(provider.getStatus().lastSyncedAt).toBeNull()
    })

    it('reports the parsed timestamp when the stored value is numeric', () => {
      localStorage.setItem('lastDriveSync', '1700000000000')
      const provider = new GoogleDriveSyncProvider()

      expect(provider.getStatus().lastSyncedAt).toBe(1700000000000)
    })
  })

  describe('silent vs interactive token acquisition (prompt / error_callback)', () => {
    // An explicit "Conectar com Google" click expects the account picker —
    // connect() must never request a token with prompt: '' (silent).
    it("connect() does not request a silent (prompt: '') token", async () => {
      await connectedProvider()

      expect(tokenClientState.configs.at(-1)?.prompt).toBeUndefined()
    })

    // This is the actual fix for "Drive asks to authorize almost every
    // time": omitting `prompt` (GIS's default) shows the account picker +
    // consent screen on every acquisition. reconnectSilently (mount-time
    // reconnect) must request prompt: '' so it never shows any Google UI.
    it("reconnectSilently() requests a silent (prompt: '') token", async () => {
      localStorage.setItem('driveClientId', 'real-client-id.apps.googleusercontent.com')
      localStorage.setItem('driveAutoReconnect', 'true')
      stubFetch({ [USERINFO_URL]: () => jsonResponse({ name: 'Test User' }) })
      const provider = new GoogleDriveSyncProvider()

      const reconnected = await provider.reconnectSilently()

      expect(reconnected).toBe(true)
      expect(tokenClientState.configs.at(-1)?.prompt).toBe('')
    })

    // No hint that this browser ever connected before — reconnectSilently
    // must not even talk to GIS, let alone show any prompt.
    it('reconnectSilently() makes no GIS request when the auto-reconnect hint is not set', async () => {
      localStorage.setItem('driveClientId', 'real-client-id.apps.googleusercontent.com')

      const provider = new GoogleDriveSyncProvider()
      const reconnected = await provider.reconnectSilently()

      expect(reconnected).toBe(false)
      expect(tokenClientState.configs).toEqual([])
    })

    // GIS reports a silent-acquisition failure (e.g. no active session to
    // reuse, or a blocked popup) via error_callback rather than callback —
    // without wiring it up, this would hang instead of failing fast.
    // reconnectSilently must resolve to false without throwing or
    // notifying, exactly as if it had never been attempted (issue #92: no
    // surprise UI/toast from a background reconnect).
    it('reconnectSilently() fails silently when GIS reports an error via error_callback', async () => {
      localStorage.setItem('driveClientId', 'real-client-id.apps.googleusercontent.com')
      localStorage.setItem('driveAutoReconnect', 'true')
      tokenClientState.mode = 'error'
      const onNotify = vi.fn()
      const provider = new GoogleDriveSyncProvider({ onNotify })

      await expect(provider.reconnectSilently()).resolves.toBe(false)
      expect(onNotify).not.toHaveBeenCalled()
    })

    // Regression test: reconnectSilently()'s acquireAccessToken call was
    // originally unbounded, unlike ensureFreshAccessToken's identical
    // silent call (which has always had a 15s timeout for exactly this
    // reason). If GIS invokes neither callback for a failed silent request
    // — a documented real-world quirk of `prompt: ''` acquisition — this
    // proves reconnectSilently() still resolves (to false) instead of
    // hanging forever on every affected page load.
    it('reconnectSilently() resolves to false instead of hanging when GIS never calls back', async () => {
      localStorage.setItem('driveClientId', 'real-client-id.apps.googleusercontent.com')
      localStorage.setItem('driveAutoReconnect', 'true')
      tokenClientState.mode = 'hang'
      const provider = new GoogleDriveSyncProvider()

      vi.useFakeTimers()
      try {
        const resultPromise = provider.reconnectSilently()
        await vi.advanceTimersByTimeAsync(15_000)
        await expect(resultPromise).resolves.toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('driveAutoReconnect hint (non-secret, not the access token itself)', () => {
    it('is written after a successful connect()', async () => {
      expect(localStorage.getItem('driveAutoReconnect')).toBeNull()

      await connectedProvider()

      expect(localStorage.getItem('driveAutoReconnect')).toBe('true')
    })

    it('is removed on disconnect()', async () => {
      const provider = await connectedProvider()
      expect(localStorage.getItem('driveAutoReconnect')).toBe('true')

      provider.disconnect()

      expect(localStorage.getItem('driveAutoReconnect')).toBeNull()
    })
  })

  describe('ensureFreshAccessToken recovers from a genuine (non-timeout) silent-refresh failure', () => {
    // A silent-only refresh (prompt: '') has no interactive fallback: if
    // the session genuinely expired or consent was revoked, GIS reports
    // that via error_callback. Regression test: previously the stale token
    // was left in place regardless of *why* the refresh failed, so the
    // panel kept claiming "Conectado" (Desconectar button) with every sync
    // silently failing — the user had to disconnect before a "Conectar"
    // button even reappeared. Now a genuine failure clears the token and
    // flips status offline, so "Conectar" is one click away.
    it('clears the stale token and flips status to offline, not just leaving it stale', async () => {
      const onStatusChange = vi.fn()
      localStorage.setItem('driveClientId', 'real-client-id.apps.googleusercontent.com')
      stubFetch({ [USERINFO_URL]: () => jsonResponse({ name: 'Test User' }) })
      const provider = new GoogleDriveSyncProvider({ onStatusChange })
      await provider.connect()
      expect(provider.getStatus().connected).toBe(true)

      // Push past TOKEN_REFRESH_MARGIN_MS (5 min before the connect-time
      // token's 3600s expiry) so the next Drive call attempts a refresh.
      tokenClientState.mode = 'error'
      vi.useFakeTimers()
      try {
        await vi.advanceTimersByTimeAsync(56 * 60 * 1000)
        // push() is a silent no-op once the token is gone (matching its
        // existing "not connected" convention) — not a throw.
        await provider.push({ projects: {} })
      } finally {
        vi.useRealTimers()
      }

      expect(provider.getStatus().connected).toBe(false)
      expect(onStatusChange).toHaveBeenCalledWith('offline')
    })

    // A mere timeout (GIS never called back at all) is left as-is — it may
    // still succeed on the next call, unlike a genuine GIS-reported
    // rejection, so the existing token is kept rather than torn down.
    it('leaves the stale token in place when the refresh merely times out', async () => {
      const onStatusChange = vi.fn()
      localStorage.setItem('driveClientId', 'real-client-id.apps.googleusercontent.com')
      stubFetch({ [USERINFO_URL]: () => jsonResponse({ name: 'Test User' }) })
      const provider = new GoogleDriveSyncProvider({ onStatusChange })
      await provider.connect()

      tokenClientState.mode = 'hang'
      vi.useFakeTimers()
      try {
        const pushPromise = provider.push({ projects: {} }).catch(() => {})
        await vi.advanceTimersByTimeAsync(56 * 60 * 1000 + 15_000)
        await pushPromise
      } finally {
        vi.useRealTimers()
      }

      expect(provider.getStatus().connected).toBe(true)
      expect(onStatusChange).not.toHaveBeenCalledWith('offline')
    })
  })
})
