# Data & Privacy

> Plain-language note on how "Marcar para Existir" handles your data. This is
> not a legal privacy policy — there's no server, no account system, and no
> analytics to disclose. This document says exactly that, and explains the
> two places your notes can actually end up.

## 1. Local-first storage (default, always on)

By default, everything you write — projects, files, folders, theme
preference — is stored in your browser's `localStorage`, on the device
you're using, in the origin `feliperoberto.com.br`.

That means:

- **Nothing leaves your device** unless you explicitly turn on Google Drive
  sync (see below).
- **There is no account, no server, and no backend.** This app is a static
  site; there is nowhere for your notes to be sent even if you wanted them
  to be.
- **It is not backed up anywhere automatically.** If you clear your
  browser's site data for this domain, uninstall the browser, switch
  devices, or use a private/incognito window, your notes are gone — there is
  no server-side copy to restore from.
- Use the built-in export (zip download) or Drive sync if you want a backup
  outside of this one browser profile.

## 2. Optional Google Drive sync (opt-in)

If you choose to enable it, Drive sync lets you back up and restore your
projects using your own Google Drive. It is entirely optional and off by
default; nothing described below happens until you paste a Client ID and
click "Conectar com Google".

What this actually does, technically:

- **The OAuth Client ID you paste in is not a secret.** A Google OAuth
  "Client ID" for a browser app is public information by design — Google's
  own documentation treats it the same way as a URL you'd put in client-side
  code. It identifies which Google Cloud project is asking for access; it is
  not a password and does not, by itself, grant access to your account or
  files. It's stored in your browser's `localStorage` so you don't have to
  re-enter it every time (see `src/features/drive-sync/config.ts`).
- **The Drive access token — the credential that actually can read/write
  your Drive data — is never persisted.** It is kept in memory only, for the
  current page session, and is never written to `localStorage`,
  `sessionStorage`, or any other persistent store. Closing or reloading the
  tab requires reconnecting (see `src/features/drive-sync/google-drive-provider.ts`).
- **Your notes are stored in Google's `appDataFolder`**, a special, hidden
  Drive space that only this app can see and use
  (`spaces=appDataFolder` / `parents: ['appDataFolder']`, requested with the
  narrow `drive.appdata` OAuth scope — not the broader `drive` or
  `drive.file` scopes). Practically, this means:
  - The backup file does **not** show up in your normal Google Drive file
    listing.
  - Other apps you've authorized on your Drive cannot see or touch it.
  - No other data in your Google account (Gmail, Docs, Photos, other Drive
    files, etc.) is accessed, read, or written. The only scope requested is
    the app's own hidden data folder.
- **Disconnecting** revokes the access token and stops sync; your local
  notes are untouched and remain in `localStorage` as before.

## 3. What this app does not do

- No analytics, telemetry, or tracking of any kind.
- No server-side database, API, or logging of your content.
- No third parties receive your notes. The only network calls Drive sync
  makes are directly from your browser to Google's own OAuth and Drive
  APIs, using credentials you control and can revoke at any time from your
  [Google Account permissions page](https://myaccount.google.com/permissions).

## Where this is enforced in code

- `src/features/drive-sync/config.ts` — Client ID storage (public, non-secret
  identifier).
- `src/features/drive-sync/google-drive-provider.ts` — access token kept
  in-memory only; `appDataFolder`/`drive.appdata` scope usage.
- `src/features/drive-sync/copy.ts` and `DriveSyncPanel.tsx` — the
  in-app (pt-BR) disclosure shown to users before they connect Google Drive.

If any of the above ever stops matching the actual implementation, treat
that as a bug: update the code, or update this document, so they stay in
sync.
