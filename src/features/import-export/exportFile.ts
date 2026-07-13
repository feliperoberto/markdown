import type { FileEntry } from './types'

/** Serializes a single file entry as a downloadable markdown Blob. */
export function exportFile(file: FileEntry): Blob {
  return new Blob([file.content], { type: 'text/markdown;charset=utf-8' })
}

/** Suggested `download` filename for a single-file export. */
export function exportFileName(file: FileEntry): string {
  return `${file.name}.md`
}
