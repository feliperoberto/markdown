import { packProjectFolders } from './zip'
import type { ProjectFiles } from './types'

/**
 * Packs all files of a single project into a downloadable ZIP Blob,
 * matching the legacy "download-project" dropdown action.
 */
export async function exportProject(projectName: string, files: ProjectFiles): Promise<Blob> {
  return packProjectFolders([{ projectName, files }])
}

/** Suggested `download` filename for a project export. */
export function exportProjectFileName(projectName: string): string {
  return `${projectName}.zip`
}
