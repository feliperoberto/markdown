import type { FileEntry } from './types'
import { sanitizeNameSegment } from './sanitize'

/**
 * Reads a single markdown file selected via a native file input
 * (`<input type="file">`) into a {@link FileEntry}.
 *
 * Mirrors the legacy "FILE UPLOAD" handler in `prototype/index.html`:
 * the file extension is stripped from the display name, and the raw
 * text content becomes the entry's content.
 */
export function importFile(file: File): Promise<FileEntry> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = String(event.target?.result ?? '')
      const cleanName = sanitizeNameSegment(file.name.replace(/\.[^/.]+$/, ''))
      resolve({
        name: cleanName,
        content,
        size: content.length,
        timestamp: new Date().toISOString(),
      })
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
