/**
 * Minimal typings + loader for the Google Identity Services (GIS) token
 * client, scoped to only what this feature uses. Avoids pulling in a full
 * `@types/gapi` dependency for a handful of calls.
 */

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

export interface GoogleTokenResponse {
  access_token?: string
  error?: string
  /**
   * Lifetime of `access_token`, in seconds, as returned by Google's token
   * endpoint (typically 3600 = 1 hour). Used to detect near-expiry and
   * proactively re-request a token via silent re-auth (see
   * `google-drive-provider.ts`) instead of letting a Drive API call fail
   * mid-session with an opaque 401.
   */
  expires_in?: number
}

export interface GoogleTokenClientError {
  type?: string
  message?: string
}

export interface GoogleTokenClient {
  requestAccessToken(): void
}

export interface GoogleTokenClientConfig {
  client_id: string
  scope: string
  callback: (response: GoogleTokenResponse) => void
  /**
   * `''` requests a token with no visible UI, resolved silently when the
   * user still has an active Google session and has already granted
   * consent for `scope` — omitting it (GIS's default) always shows the
   * account picker + consent screen, even for a routine background
   * refresh. See `google-drive-provider.ts`'s `acquireAccessToken`.
   */
  prompt?: string
  /**
   * Reports failures GIS doesn't route through `callback` at all — e.g. a
   * blocked popup, or no consent to silently reuse when `prompt: ''` is
   * set. Without this, a silent acquisition attempt can hang indefinitely
   * instead of failing fast.
   */
  error_callback?: (error: GoogleTokenClientError) => void
}

export interface GoogleIdentityGlobal {
  accounts: {
    oauth2: {
      initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient
      revoke(token: string, done: () => void): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityGlobal
  }
}

/**
 * Ensures the GIS script tag is present, loading it lazily if needed, and
 * resolves with the `google` global once available.
 */
export function loadGoogleIdentity(): Promise<GoogleIdentityGlobal> {
  if (window.google?.accounts) {
    return Promise.resolve(window.google)
  }

  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[src="${GIS_SCRIPT_SRC}"]`,
  )

  return new Promise((resolve, reject) => {
    const onLoad = () => {
      if (window.google?.accounts) {
        resolve(window.google)
      } else {
        reject(new Error('Google Identity Services failed to initialize'))
      }
    }

    if (existingScript) {
      existingScript.addEventListener('load', onLoad, { once: true })
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Identity Services')),
        {
          once: true,
        },
      )
      return
    }

    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', onLoad, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('Failed to load Google Identity Services')),
      {
        once: true,
      },
    )
    document.head.appendChild(script)
  })
}

export function isGoogleIdentityAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.google?.accounts
}
