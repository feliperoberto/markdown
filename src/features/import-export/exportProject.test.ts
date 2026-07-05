import { describe, expect, it } from 'vitest'
import { JSZip } from './zip'
import { exportProject, exportProjectFileName } from './exportProject'
import type { ProjectFiles } from './types'

const files: ProjectFiles = {
  notes: { name: 'notes', content: '# Hello', size: 7, timestamp: '2024-01-01T00:00:00.000Z' },
  todo: { name: 'todo', content: '- [ ] item', size: 10, timestamp: '2024-01-01T00:00:00.000Z' },
}

describe('exportProject', () => {
  it('packs every file into a single ZIP under the project folder', async () => {
    const blob = await exportProject('My Project', files)
    const zip = await JSZip.loadAsync(blob)

    const notesContent = await zip.file('My Project/notes.md')?.async('string')
    const todoContent = await zip.file('My Project/todo.md')?.async('string')

    expect(notesContent).toBe('# Hello')
    expect(todoContent).toBe('- [ ] item')
  })

  it('produces an empty project folder when given no files', async () => {
    const blob = await exportProject('Empty', {})
    const zip = await JSZip.loadAsync(blob)

    const entries = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir)
    expect(entries).toEqual([])
  })
})

describe('exportProjectFileName', () => {
  it('appends .zip to the project name', () => {
    expect(exportProjectFileName('My Project')).toBe('My Project.zip')
  })
})
