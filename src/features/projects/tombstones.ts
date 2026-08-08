// Deletion markers for renamed/deleted files and projects, synced via
// Drive (see google-drive-provider.ts's uploadSnapshot/pull) alongside
// `projects` so a rename or delete propagates instead of the old key
// silently resurrecting on the next sync — see model.ts's
// mergeProjectsByFreshness, the only place that actually reads these.
//
// File-tombstone keys reuse model.ts's `encodeArchivedFileKey` (same
// composite-key reasoning: names aren't sanitized against arbitrary
// characters outside the ZIP-import/Drive-restore boundary, so a
// hand-rolled delimiter would be unsafe); project-tombstone keys use its
// `encodeProjectTombstoneKey` sibling. This module owns only the
// operations over the resulting `key -> ISO deletedAt` map — recording,
// clearing, merging two devices' sets, and pruning old entries — never the
// encoding itself, mirroring storage.ts treating archived-file keys as
// opaque.
import {
  decodeArchivedFileKey,
  decodeProjectTombstoneKey,
  encodeArchivedFileKey,
  encodeProjectTombstoneKey,
} from './model'

/** Composite key (see encodeArchivedFileKey/encodeProjectTombstoneKey) -> ISO deletedAt. */
export type Tombstones = Readonly<Record<string, string>>

export const NO_TOMBSTONES: Tombstones = {}

/** Records (or refreshes) a tombstone for `key`. Same-reference-on-no-op when `deletedAt` is already recorded verbatim. */
function recordTombstone(tombstones: Tombstones, key: string, deletedAt: string): Tombstones {
  if (tombstones[key] === deletedAt) return tombstones
  return { ...tombstones, [key]: deletedAt }
}

export function recordFileTombstone(
  tombstones: Tombstones,
  projectName: string,
  fileName: string,
  deletedAt: string,
): Tombstones {
  return recordTombstone(tombstones, encodeArchivedFileKey(projectName, fileName), deletedAt)
}

export function recordProjectTombstone(
  tombstones: Tombstones,
  projectName: string,
  deletedAt: string,
): Tombstones {
  return recordTombstone(tombstones, encodeProjectTombstoneKey(projectName), deletedAt)
}

/**
 * Clears a tombstone for a file key, if present. Called at every site that
 * re-creates a key a tombstone might already shadow (a new file taking a
 * recently-deleted name, a rename/move landing on a destination key) — the
 * comparison in `mergeProjectsByFreshness` (a fresh timestamp always beats
 * an old tombstone) already makes this belt-and-braces rather than load-
 * bearing, but it keeps the sidecar from carrying a stale entry indefinitely.
 * Same-reference-on-no-op, matching model.ts's convention.
 */
export function clearFileTombstone(
  tombstones: Tombstones,
  projectName: string,
  fileName: string,
): Tombstones {
  const key = encodeArchivedFileKey(projectName, fileName)
  if (!(key in tombstones)) return tombstones
  const next = { ...tombstones }
  delete next[key]
  return next
}

/** Same reasoning as `clearFileTombstone`, one level up. */
export function clearProjectTombstone(tombstones: Tombstones, projectName: string): Tombstones {
  const key = encodeProjectTombstoneKey(projectName)
  if (!(key in tombstones)) return tombstones
  const next = { ...tombstones }
  delete next[key]
  return next
}

/**
 * Combines two devices' tombstone sets before merging/pushing (mirrors
 * `mergeProjectsByFreshness` being union-based) — the later `deletedAt`
 * wins per key, so neither side's deletion is ever silently forgotten.
 * Same-reference-on-no-op: returns `a` unchanged when `b` contributes
 * nothing newer.
 */
export function mergeTombstones(a: Tombstones, b: Tombstones): Tombstones {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  let changed = Object.keys(a).length !== keys.size
  const merged: Record<string, string> = {}
  for (const key of keys) {
    const av = a[key]
    const bv = b[key]
    const winner = av === undefined || (bv !== undefined && bv > av) ? (bv as string) : av
    merged[key] = winner
    if (winner !== av) changed = true
  }
  return changed ? merged : a
}

/**
 * Drops tombstones older than `ttlMs` relative to `nowIso` so the sidecar
 * doesn't grow forever — a tombstone only needs to outlive the longest
 * plausible gap between two devices syncing, not the life of the app.
 * Malformed `deletedAt` values are dropped too, matching this codebase's
 * defensive-parsing convention. Same-reference-on-no-op.
 */
export function pruneTombstones(tombstones: Tombstones, nowIso: string, ttlMs: number): Tombstones {
  const cutoff = Date.parse(nowIso) - ttlMs
  let changed = false
  const next: Record<string, string> = {}
  for (const [key, deletedAt] of Object.entries(tombstones)) {
    const parsed = Date.parse(deletedAt)
    if (Number.isFinite(parsed) && parsed >= cutoff) {
      next[key] = deletedAt
    } else {
      changed = true
    }
  }
  return changed ? next : tombstones
}

/**
 * Normalizes an untrusted `Tombstones`-shaped blob (a pulled Drive
 * snapshot) — the same boundary `normalizeProjectsState` (validate.ts)
 * guards for `projects`. Drops keys that don't decode as a known
 * tombstone-key shape and values that aren't parseable ISO timestamps, so
 * a hand-edited or differently-schemaed backup degrades gracefully instead
 * of poisoning the merge with garbage that could either wrongly suppress
 * real content or never suppress anything at all.
 */
export function normalizeTombstones(raw: unknown): Tombstones {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return NO_TOMBSTONES

  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) continue
    if (!decodeArchivedFileKey(key) && !decodeProjectTombstoneKey(key)) continue
    next[key] = value
  }
  return next
}
