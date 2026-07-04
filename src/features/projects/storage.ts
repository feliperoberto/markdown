import { localStorageAdapter, type StorageAdapter } from '@/lib/storage-adapter'
import type { ProjectsState } from './types'

const PROJECTS_STORAGE_KEY = 'projects'

export function loadProjects(adapter: StorageAdapter = localStorageAdapter): ProjectsState {
  const raw = adapter.get(PROJECTS_STORAGE_KEY)
  if (!raw) return {}

  try {
    return JSON.parse(raw) as ProjectsState
  } catch (error) {
    console.error('Failed to parse stored projects; starting from an empty state.', error)
    return {}
  }
}

export function saveProjects(projects: ProjectsState, adapter: StorageAdapter = localStorageAdapter): void {
  adapter.set(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
}
