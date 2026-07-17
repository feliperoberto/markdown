import { formatRelativeTime } from '@/lib/formatRelativeTime'

/**
 * Formats a `lastSyncedAt` epoch-ms timestamp as a relative "há Xm/Xh/Xd"
 * string. Returns `null` for "never synced" so callers can render the
 * distinct `neverSyncedStatus` copy instead — `formatRelativeTime` itself
 * has no concept of "never", only a timestamp.
 */
export function formatLastSynced(
  lastSyncedAt: number | null,
  now: number = Date.now(),
): string | null {
  if (lastSyncedAt === null) return null
  return formatRelativeTime(lastSyncedAt, now)
}
