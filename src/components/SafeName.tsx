import type { JSX } from 'preact'
import { escapeHtml } from '@/features/import-export/sanitize'

export interface SafeNameProps {
  value: string
}

/**
 * Explicit, self-documenting wrapper for rendering a user-controlled
 * project/file name when a call site is NOT a plain JSX text child (e.g.
 * it goes through `dangerouslySetInnerHTML` or is serialized into an
 * HTML string). Ordinary `{name}` JSX children do not need this — Preact
 * already auto-escapes those. Colocated here as the one place future
 * authors should reach for if a non-JSX rendering path for names is ever
 * introduced (see `src/features/import-export/sanitize.ts`).
 */
export function SafeName({ value }: SafeNameProps): JSX.Element {
  return <span>{escapeHtml(value)}</span>
}
