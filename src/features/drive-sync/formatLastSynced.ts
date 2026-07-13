/**
 * Formats a `lastSyncedAt` epoch-ms timestamp as the prototype's relative
 * "há Xm/Xh/Xd" string (`prototype/index.html`'s `updateDriveBtnTitle`/
 * drive-modal sync-status block). Returns `null` for "never synced" so
 * callers can render the distinct `neverSyncedStatus` copy instead.
 */
export function formatLastSynced(
  lastSyncedAt: number | null,
  now: number = Date.now(),
): string | null {
  if (lastSyncedAt === null) return null

  const diffMins = Math.floor((now - lastSyncedAt) / 60000)

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `há ${diffMins}m`
  if (diffMins < 1440) return `há ${Math.floor(diffMins / 60)}h`
  return `há ${Math.floor(diffMins / 1440)}d`
}
