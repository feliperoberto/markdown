import type { JSX } from 'preact'
import { driveSyncCopy } from './copy'

export interface DriveConnectionStatusProps {
  userName: string | null
}

/**
 * "Connected as X" / "not connected" status row, rendered by
 * `DriveConfigPanel` (issue #110). Extracted out of `DriveConfigPanel.tsx`
 * so the panel component stays focused on layout/actions.
 */
export function DriveConnectionStatus({ userName }: DriveConnectionStatusProps): JSX.Element {
  return (
    <div class="drive-status">
      <span class="drive-status-icon" aria-hidden="true">
        {userName ? '✅' : '☁️'}
      </span>
      {userName ? (
        <div class="drive-status-text">
          <span class="drive-status-name">{`Conectado como ${userName}`}</span>
        </div>
      ) : (
        <span class="drive-status-text">{driveSyncCopy.notConnectedStatus}</span>
      )}
    </div>
  )
}
