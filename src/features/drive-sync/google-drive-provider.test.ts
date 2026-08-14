import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleDriveSyncProvider } from './google-drive-provider'

// Never hit real Google endpoints in tests: the GIS script loader resolves
// synchronously with a fake token instead of any real popup/redirect flow.
vi.mock('./google-identity', () => ({
  loadGoogleIdentity: vi.fn().mockResolvedValue({
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          callback: (response: { access_token: string; expires_in: number }) => void
        }) => ({
          requestAccessToken: () =>
            config.callback({ access_token: 'fake-token', expires_in: 3600 }),
        }),
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
    it('records lastDriveSync after a successful manual push', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () => jsonResponse({ files: [] }),
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart': () =>
          jsonResponse({ id: 'new-file-id' }),
      })

      expect(localStorage.getItem('lastDriveSync')).toBeNull()

      await provider.push({ projects: { A: {} } })

      expect(localStorage.getItem('lastDriveSync')).not.toBeNull()
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
})
