import JSZipLib from 'jszip'

export { default as JSZip } from 'jszip'

/** One project's worth of files to pack into a ZIP folder. */
export interface ZipFolderEntry {
  projectName: string
  files: Record<string, { content: string }>
}

/**
 * Packs one or more project folders into a single ZIP Blob — the shared
 * "group files under a project folder, write `${fileName}.md`, DEFLATE"
 * step that exportProject.ts (a single project) and exportBatch.ts (a
 * multi-project selection) both need. Previously duplicated verbatim in
 * both files; a change to the file-naming convention or compression
 * settings had to be made in two places.
 */
export async function packProjectFolders(entries: ZipFolderEntry[]): Promise<Blob> {
  const zip = new JSZipLib()
  for (const { projectName, files } of entries) {
    const folder = zip.folder(projectName)
    for (const [fileName, fileData] of Object.entries(files)) {
      folder?.file(`${fileName}.md`, fileData.content ?? '')
    }
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
