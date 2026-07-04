/**
 * Google Drive OAuth Client ID configuration.
 *
 * IMPORTANT — security note preserved from the original implementation:
 * an OAuth "Client ID" for a public/browser app is *not* a secret (unlike
 * a client secret or an access token). Google's own docs treat it as
 * public information that is safe to embed in client-side code or, as
 * here, store in `localStorage`. The Drive *access token* obtained via
 * this Client ID is the actual sensitive credential, and it is
 * deliberately kept in memory only — see `google-drive-provider.ts`.
 */

const CLIENT_ID_STORAGE_KEY = 'driveClientId'

export const PLACEHOLDER_CLIENT_ID = 'SEU_CLIENT_ID_AQUI.apps.googleusercontent.com'

export function getStoredClientId(): string {
  return localStorage.getItem(CLIENT_ID_STORAGE_KEY) || PLACEHOLDER_CLIENT_ID
}

export function setStoredClientId(clientId: string): void {
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId)
}

export function clearStoredClientId(): void {
  localStorage.removeItem(CLIENT_ID_STORAGE_KEY)
}

export function isPlaceholderClientId(clientId: string): boolean {
  return clientId.startsWith('SEU_CLIENT_ID')
}

export function isClientIdConfigured(clientId: string): boolean {
  return clientId.trim().length > 0 && !isPlaceholderClientId(clientId)
}
