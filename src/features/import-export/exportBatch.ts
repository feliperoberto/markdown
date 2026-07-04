import { JSZip } from './zip'
import type { BatchSelectionEntry } from './types'

/**
 * Packs a multi-select batch of files (possibly spanning several
 * projects) into a single downloadable ZIP Blob, grouped by project
 * folder — matching the legacy "downloadBatchBtn" handler.
 */
export async function exportBatch(selection: BatchSelectionEntry[]): Promise<Blob> {
  const zip = new JSZip()
  const filesByProject = new Map<string, BatchSelectionEntry[]>()

  for (const entry of selection) {
    const existing = filesByProject.get(entry.projectName)
    if (existing) {
      existing.push(entry)
    } else {
      filesByProject.set(entry.projectName, [entry])
    }
  }

  filesByProject.forEach((entries, projectName) => {
    const folder = zip.folder(projectName)
    entries.forEach(({ fileName, file }) => {
      folder?.file(`${fileName}.md`, file.content ?? '')
    })
  })

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/** Suggested `download` filename for a batch export. */
export function exportBatchFileName(date: Date = new Date()): string {
  return `projetos-${date.toISOString().split('T')[0]}.zip`
}
