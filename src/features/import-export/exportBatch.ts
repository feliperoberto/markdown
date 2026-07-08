import { packProjectFolders } from './zip'
import type { BatchSelectionEntry } from './types'

/**
 * Packs a multi-select batch of files (possibly spanning several
 * projects) into a single downloadable ZIP Blob, grouped by project
 * folder — matching the legacy "downloadBatchBtn" handler.
 */
export async function exportBatch(selection: BatchSelectionEntry[]): Promise<Blob> {
  const filesByProject = new Map<string, Record<string, { content: string }>>()

  for (const { projectName, fileName, file } of selection) {
    const existing = filesByProject.get(projectName)
    if (existing) {
      existing[fileName] = file
    } else {
      filesByProject.set(projectName, { [fileName]: file })
    }
  }

  return packProjectFolders(
    Array.from(filesByProject, ([projectName, files]) => ({ projectName, files })),
  )
}

/** Suggested `download` filename for a batch export. */
export function exportBatchFileName(date: Date = new Date()): string {
  return `projetos-${date.toISOString().split('T')[0]}.zip`
}
