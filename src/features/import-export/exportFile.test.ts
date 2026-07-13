import { describe, expect, it } from 'vitest'
import { exportFile, exportFileName } from './exportFile'
import type { FileEntry } from './types'

const file: FileEntry = {
  name: 'notes',
  content: '# Hello world',
  size: 13,
  timestamp: '2024-01-01T00:00:00.000Z',
}

describe('exportFile', () => {
  it('serializes the file content as a markdown Blob', async () => {
    const blob = exportFile(file)

    expect(blob.type).toBe('text/markdown;charset=utf-8')
    await expect(blob.text()).resolves.toBe('# Hello world')
  })
})

describe('exportFileName', () => {
  it('appends .md to the file name', () => {
    expect(exportFileName(file)).toBe('notes.md')
  })
})
