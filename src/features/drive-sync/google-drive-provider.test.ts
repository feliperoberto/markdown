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

      await expect(provider.sync({ projects: { A: {} } })).rejects.toThrow()

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

      await expect(provider.sync({ projects: {} })).rejects.toThrow(/quota exceeded/)
    })
  })

  describe('uploadSnapshot bookkeeping', () => {
    // Regression test: projectsLastModified was previously written ONLY by
    // the auto-sync tick, never by a manual sync — so after "Sincronizar
    // agora" the next auto-sync tick saw a stale hash and redundantly
    // re-uploaded identical data. Bookkeeping is now centralized in
    // uploadSnapshot, so a manual sync() records both keys.
    it('records lastDriveSync and projectsLastModified after a successful manual sync', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () => jsonResponse({ files: [] }),
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart': () =>
          jsonResponse({ id: 'new-file-id' }),
      })

      expect(localStorage.getItem('projectsLastModified')).toBeNull()

      await provider.sync({ projects: { A: {} } })

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

      await provider.sync({ projects: {} })

      expect(calls).toEqual(['PATCH'])
    })
  })

  describe('importFromDrive', () => {
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

      await expect(provider.importFromDrive()).rejects.toThrow('Formato de backup inválido')
    })

    it('rejects with a clear message when the backup is missing a `projects` field', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () =>
          jsonResponse({ files: [{ id: 'file-id', name: 'x', modifiedTime: 't' }] }),
        'https://www.googleapis.com/drive/v3/files/file-id?alt=media': () => jsonResponse({}),
      })

      await expect(provider.importFromDrive()).rejects.toThrow('Formato de backup inválido')
    })

    it('resolves with the projects payload from a well-formed backup', async () => {
      const provider = await connectedProvider()
      stubFetch({
        [FILES_LIST_URL]: () =>
          jsonResponse({ files: [{ id: 'file-id', name: 'x', modifiedTime: 't' }] }),
        'https://www.googleapis.com/drive/v3/files/file-id?alt=media': () =>
          jsonResponse({ version: 1, projects: { A: { f: { name: 'f' } } } }),
      })

      await expect(provider.importFromDrive()).resolves.toEqual({ A: { f: { name: 'f' } } })
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
