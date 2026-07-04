/**
 * Public interface of the import/export feature.
 *
 * Other features (e.g. projects) should depend only on this module's
 * exports rather than reaching into its internals or sharing globals,
 * so import/export concerns (file upload, ZIP parsing/generation,
 * name sanitization) stay owned in one place.
 */
export type { FileEntry, ProjectFiles, ProjectsPatch, BatchSelectionEntry } from './types'
export { escapeHtml, sanitizeNameSegment } from './sanitize'
export { importFile } from './importFile'
export { importZip } from './importZip'
export { exportFile, exportFileName } from './exportFile'
export { exportProject, exportProjectFileName } from './exportProject'
export { exportBatch, exportBatchFileName } from './exportBatch'
