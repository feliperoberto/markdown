import { JSZip } from './zip'
import type { ProjectFiles } from './types'

/**
 * Packs all files of a single project into a downloadable ZIP Blob,
 * matching the legacy "download-project" dropdown action.
 */
export async function exportProject(projectName: string, files: ProjectFiles): Promise<Blob> {
  const zip = new JSZip()
  const folder = zip.folder(projectName)
  Object.entries(files).forEach(([fileName, fileData]) => {
    folder?.file(`${fileName}.md`, fileData.content ?? '')
  })
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/** Suggested `download` filename for a project export. */
export function exportProjectFileName(projectName: string): string {
  return `${projectName}.zip`
}
