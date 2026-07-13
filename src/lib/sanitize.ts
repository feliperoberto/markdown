/**
 * Sanitization helpers for names that originate from user-controlled or
 * external sources (uploaded files, ZIP archive entries, a restored Drive
 * backup) and later flow into either the DOM or the filesystem-like
 * `projects` store.
 *
 * Lives in `src/lib/` (rather than a single feature) because more than
 * one feature needs it: `import-export` (ZIP/file import) and `projects`
 * (Drive-restore validation) both sanitize external names before they
 * become object keys.
 *
 * ZIP-derived project/file names are the concrete XSS attack vector
 * fixed in issue #27 (unsanitized innerHTML on project/file names): a
 * ZIP entry named e.g. `<img src=x onerror=alert(1)>.md` must never be
 * able to execute script once rendered. We sanitize as early as
 * possible, at import time, rather than relying solely on every
 * downstream renderer remembering to escape.
 */

/** Escapes a string for safe interpolation into an HTML template. */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Intentionally strips ASCII control characters (including NUL) from
// untrusted names; see issue #27.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g

/**
 * Normalizes a project/file name segment coming from a ZIP entry path,
 * an uploaded file's `name`, or a restored Drive backup:
 * - strips control characters
 * - strips path separators / leading dots so a malicious entry
 *   (e.g. `../../etc/passwd`) can't escape the intended project/file
 *   structure
 * - trims surrounding whitespace
 *
 * The result is still HTML-unsafe by design (it may legitimately
 * contain `<`, `&`, etc. as literal characters a user typed into a
 * file name) — callers rendering it into HTML must still run it
 * through `escapeHtml` at render time. This function only guards
 * against structural/path abuse and invisible characters.
 */
export function sanitizeNameSegment(value: string): string {
  return value.replace(CONTROL_CHARS, '').replace(/[/\\]/g, '').replace(/^\.+/, '').trim()
}

/**
 * Audited (issue #27 review, 2026-07): every current call site that
 * renders a project/file name (`FileRow.tsx`, `ProjectGroup.tsx`, and the
 * `Toast` messages in `ImportExportToolbar.tsx`/`DriveSyncPanel.tsx`)
 * does so as a plain `{name}` JSX text child, which Preact auto-escapes.
 * There is currently no `innerHTML`/`dangerouslySetInnerHTML` render path
 * for these names anywhere in the app, so no caller needs to invoke
 * `escapeHtml` today.
 *
 * `escapeHtml` remains exported as a safety net for any FUTURE non-JSX
 * rendering need (e.g. building an HTML string manually, exporting to an
 * HTML file, etc). If you add such a path, use `escapeHtml` directly
 * rather than trusting auto-escaping alone.
 */
