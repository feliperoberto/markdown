import type { JSX } from 'preact'
import { driveSyncCopy } from './copy'

export interface DriveConnectionStatusProps {
  userName: string | null
}

/**
 * "Connected as X" / "not connected" status row — shared markup between
 * `DriveSyncPanel` and `DriveConfigPanel` (issue #110 split both out of a
 * single panel). Kept here instead of copy-pasted in each so a future
 * change to how connection status is displayed only has one place to edit.
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
