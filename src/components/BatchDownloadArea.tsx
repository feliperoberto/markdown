import type { JSX } from 'preact'
import { Button } from './Button'

export interface BatchDownloadAreaEntry {
  projectName: string
  fileName: string
}

export interface BatchDownloadAreaProps {
  entries: readonly BatchDownloadAreaEntry[]
  onDownload: () => void
}

/**
 * Replaces the editor/preview panes when ≥2 files are checked for batch
 * download — matches the prototype's `#batchDownloadArea` exactly
 * (icon, title, per-file list grouped implicitly by insertion order,
 * "Baixar ZIP" button disabled below the 2-file threshold). This is a
 * real prototype feature (its own third `<main>` pane, not something
 * the migration invented) that had no equivalent surface here.
 */
export function BatchDownloadArea({ entries, onDownload }: BatchDownloadAreaProps): JSX.Element {
  return (
    <div class={`batch-download-area${entries.length > 1 ? ' visible' : ''}`}>
      <div class="batch-icon" aria-hidden="true">
        📦
      </div>
      <div class="batch-title">Vários arquivos</div>
      <div class="batch-description">Prontos para baixar</div>
      <div class="batch-files-list">
        {entries.map(({ projectName, fileName }) => (
          <div class="batch-file-item" key={`${projectName}/${fileName}`}>
            <div class="batch-file-project">{projectName}</div>
            <div class="batch-file-name">📄 {fileName}</div>
          </div>
        ))}
      </div>
      <Button variant="primary" disabled={entries.length < 2} onClick={onDownload}>
        Baixar ZIP
      </Button>
    </div>
  )
}
