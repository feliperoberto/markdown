import { describe, expect, it } from 'vitest'
import { importFile } from './importFile'

describe('importFile', () => {
  it('reads the file content and strips the extension from the name', async () => {
    const file = new File(['# Hello'], 'notes.md', { type: 'text/markdown' })

    const entry = await importFile(file)

    expect(entry.name).toBe('notes')
    expect(entry.content).toBe('# Hello')
    expect(entry.size).toBe(7)
  })

  // Regression test: a name that sanitizes to nothing (e.g. "...md", a
  // dotfile, or a name made entirely of control/path characters)
  // previously resolved successfully with an empty-string name, becoming
  // a nameless, unselectable row silently merged into the project.
  it('rejects a file whose sanitized name is empty', async () => {
    const file = new File(['content'], '...md', { type: 'text/markdown' })

    await expect(importFile(file)).rejects.toThrow(/Nome de arquivo inválido/)
  })

  it('rejects a dotfile with no other name content', async () => {
    const file = new File(['content'], '.md', { type: 'text/markdown' })

    await expect(importFile(file)).rejects.toThrow(/Nome de arquivo inválido/)
  })
})
