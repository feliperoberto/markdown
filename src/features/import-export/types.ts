/**
 * Shared types for the import/export feature.
 *
 * These mirror the shape historically stored in `localStorage` by the
 * prototype (`prototype/index.html`) so the projects feature can adopt
 * this module without a data migration.
 */

/** A single markdown file as stored inside a project. */
export interface FileEntry {
  name: string
  content: string
  size: number
  timestamp: string
}

/** All files belonging to one project, keyed by (sanitized) file name. */
export type ProjectFiles = Record<string, FileEntry>

/**
 * Result of an import operation: new/updated projects and their files,
 * keyed by (sanitized) project name. Callers are expected to merge this
 * into their own project store (ZIP entries win on file name conflicts,
 * matching the historical behaviour).
 */
export type ProjectsPatch = Record<string, ProjectFiles>

/** One file selected for a batch (multi-select) export. */
export interface BatchSelectionEntry {
  projectName: string
  fileName: string
  file: FileEntry
}
