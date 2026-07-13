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
import { localStorageAdapter } from '@/lib/storage-adapter'

const CLIENT_ID_STORAGE_KEY = 'driveClientId'

export const PLACEHOLDER_CLIENT_ID = 'SEU_CLIENT_ID_AQUI.apps.googleusercontent.com'

// Returns '' (never the placeholder) when nothing is stored, so callers
// can put this directly in an <input value> without pre-filling it with
// text that reads as real, already-entered data. A caller that wants
// guidance copy for an empty field should use PLACEHOLDER_CLIENT_ID (or
// clientIdPlaceholder copy) as the input's `placeholder` attribute
// instead — a real value previously let a user click "Salvar" without
// typing anything and silently persist the placeholder string as their
// Client ID, since it made the empty-input guard never see an empty string.
export function getStoredClientId(): string {
  return localStorageAdapter.get(CLIENT_ID_STORAGE_KEY) ?? ''
}

export function setStoredClientId(clientId: string): void {
  if (isPlaceholderClientId(clientId)) return
  localStorageAdapter.set(CLIENT_ID_STORAGE_KEY, clientId)
}

export function clearStoredClientId(): void {
  localStorageAdapter.remove(CLIENT_ID_STORAGE_KEY)
}

export function isPlaceholderClientId(clientId: string): boolean {
  return clientId.startsWith('SEU_CLIENT_ID')
}

export function isClientIdConfigured(clientId: string): boolean {
  return clientId.trim().length > 0 && !isPlaceholderClientId(clientId)
}
