import { describe, expect, it } from 'vitest'
import { JSZip } from './zip'
import { exportBatch, exportBatchFileName } from './exportBatch'
import type { BatchSelectionEntry } from './types'

const entries: BatchSelectionEntry[] = [
  {
    projectName: 'Project A',
    fileName: 'notes',
    file: { name: 'notes', content: 'A notes', size: 7, timestamp: '2024-01-01T00:00:00.000Z' },
  },
  {
    projectName: 'Project A',
    fileName: 'todo',
    file: { name: 'todo', content: 'A todo', size: 6, timestamp: '2024-01-01T00:00:00.000Z' },
  },
  {
    projectName: 'Project B',
    fileName: 'readme',
    file: { name: 'readme', content: 'B readme', size: 8, timestamp: '2024-01-01T00:00:00.000Z' },
  },
]

describe('exportBatch', () => {
  it('groups selected files by project folder in the resulting ZIP', async () => {
    const blob = await exportBatch(entries)
    const zip = await JSZip.loadAsync(blob)

    expect(await zip.file('Project A/notes.md')?.async('string')).toBe('A notes')
    expect(await zip.file('Project A/todo.md')?.async('string')).toBe('A todo')
    expect(await zip.file('Project B/readme.md')?.async('string')).toBe('B readme')
  })

  it('handles an empty selection by producing an empty ZIP', async () => {
    const blob = await exportBatch([])
    const zip = await JSZip.loadAsync(blob)

    const fileEntries = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir)
    expect(fileEntries).toEqual([])
  })
})

describe('exportBatchFileName', () => {
  it('formats the file name using the given date', () => {
    const date = new Date('2024-03-15T12:00:00.000Z')

    expect(exportBatchFileName(date)).toBe('projetos-2024-03-15.zip')
  })

  it('defaults to the current date when none is given', () => {
    const before = new Date().toISOString().split('T')[0]

    expect(exportBatchFileName()).toBe(`projetos-${before}.zip`)
  })
})
