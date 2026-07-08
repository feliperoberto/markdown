import { JSZip } from './zip'
import type { ProjectsPatch } from './types'
import { sanitizeNameSegment } from './sanitize'

/**
 * Parses a ZIP archive into a {@link ProjectsPatch}.
 *
 * Expected structure (matching the legacy "IMPORT ZIP" handler in
 * `prototype/index.html`): `<ProjectName>/<file>.md` entries, one
 * folder level deep. Deeper-nested entries are supported too — only
 * the first path segment is treated as the project name and the last
 * as the file name, so `Project/sub/dir/file.md` still resolves.
 *
 * Every project/file name is run through {@link sanitizeNameSegment}
 * before being used, since these names come straight from
 * attacker-controlled ZIP entry paths (see issue #27: a ZIP entry
 * named e.g. `<img src=x onerror=alert(1)>.md` must not be able to
 * inject markup once a caller renders the resulting name into the
 * DOM). Callers must still `escapeHtml()` these names at render time
 * — this sanitization only strips structural/path abuse and control
 * characters, not HTML metacharacters, since file names may
 * legitimately contain characters like `&` or `<`.
 *
 * Throws if the archive contains no valid `.md` entries.
 */
export async function importZip(file: File | Blob): Promise<ProjectsPatch> {
  const zip = await JSZip.loadAsync(file)
  const imported: ProjectsPatch = {}
  const pending: Promise<void>[] = []
  // Tracks project/file keys already claimed within THIS zip, so two
  // distinct entries that sanitize to the same key (e.g. "notes.md" and
  // "notes .md", or entries under different original paths that collapse
  // after sanitization) don't silently overwrite one another with no
  // indication anything was lost — surfaced via the returned `skipped`
  // count rather than an exception, so the rest of the archive still imports.
  const claimedKeys = new Set<string>()
  let skippedDuplicates = 0

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return

    const parts = relativePath.split('/').filter(Boolean)
    if (parts.length < 2) return

    const projectName = sanitizeNameSegment(parts[0] ?? '')
    const rawFileName = parts[parts.length - 1] ?? ''
    const fileName = sanitizeNameSegment(rawFileName.replace(/\.md$/i, ''))
    if (!projectName || !fileName) return

    const key = `${projectName}/${fileName}`
    if (claimedKeys.has(key)) {
      skippedDuplicates++
      return
    }
    claimedKeys.add(key)

    pending.push(
      zipEntry.async('string').then((content) => {
        if (!imported[projectName]) imported[projectName] = {}
        imported[projectName][fileName] = {
          name: fileName,
          content,
          size: content.length,
          timestamp: new Date().toISOString(),
        }
      }),
    )
  })

  await Promise.all(pending)

  if (Object.keys(imported).length === 0) {
    throw new Error('ZIP sem arquivos .md válidos')
  }

  if (skippedDuplicates > 0) {
    console.warn(
      `importZip: ${skippedDuplicates} entrada(s) ignorada(s) por colidir com um nome já importado neste ZIP.`,
    )
  }

  return imported
}
