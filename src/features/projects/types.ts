export interface ProjectFile {
  name: string
  content: string
  size: number
  timestamp: string
}

export type ProjectFiles = Record<string, ProjectFile>

// Nested `projects[projectName][fileName]` shape, matching the legacy
// prototype state so existing persisted data (and the #21 drive-sync /
// #20 import-export features, which read/write the same shape) keeps working.
export type ProjectsState = Record<string, ProjectFiles>
