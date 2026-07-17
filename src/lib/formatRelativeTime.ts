/**
 * Formats an epoch-ms timestamp as a relative "há Xm/Xh/Xd" string
 * (originally the prototype's `updateDriveBtnTitle`/drive-modal
 * sync-status block). Shared across features (Drive "last synced" display,
 * per-file "last modified" display) so both use identical relative-time
 * wording instead of drifting copies — see `CONTRIBUTING.md`'s "Feature
 * taxonomy" for why this lives in `src/lib` rather than in either feature.
 */
export function formatRelativeTime(epochMs: number, now: number = Date.now()): string {
  const diffMins = Math.floor((now - epochMs) / 60000)

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `há ${diffMins}m`
  if (diffMins < 1440) return `há ${Math.floor(diffMins / 60)}h`
  return `há ${Math.floor(diffMins / 1440)}d`
}
