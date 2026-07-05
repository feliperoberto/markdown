import { describe, expect, it } from 'vitest'
import { JSZip } from './zip'
import { importZip } from './importZip'

describe('importZip', () => {
  it('parses a well-formed <Project>/<file>.md archive into a ProjectsPatch', async () => {
    const zip = new JSZip()
    zip.file('My Project/notes.md', '# Hello')
    const blob = await zip.generateAsync({ type: 'blob' })

    const patch = await importZip(blob)

    expect(Object.keys(patch)).toEqual(['My Project'])
    expect(patch['My Project']?.notes?.content).toBe('# Hello')
    expect(patch['My Project']?.notes?.name).toBe('notes')
  })

  it('resolves deeper-nested entries using the first segment as project and last as file name', async () => {
    const zip = new JSZip()
    zip.file('Project/sub/dir/file.md', 'content')
    const blob = await zip.generateAsync({ type: 'blob' })

    const patch = await importZip(blob)

    expect(patch.Project?.file?.content).toBe('content')
  })

  it('ignores top-level entries with no project folder (fewer than 2 path segments)', async () => {
    const zip = new JSZip()
    zip.file('orphan.md', 'ignored')
    zip.file('Project/keep.md', 'kept')
    const blob = await zip.generateAsync({ type: 'blob' })

    const patch = await importZip(blob)

    expect(Object.keys(patch)).toEqual(['Project'])
    expect(patch.Project?.keep?.content).toBe('kept')
  })

  it('throws when the archive has no usable file entries at all (only a top-level folder)', async () => {
    const zip = new JSZip()
    zip.folder('Project')
    const blob = await zip.generateAsync({ type: 'blob' })

    await expect(importZip(blob)).rejects.toThrow('ZIP sem arquivos .md válidos')
  })

  it('imports non-.md files too (only entries with fewer than 2 path segments are skipped)', async () => {
    const zip = new JSZip()
    zip.file('Project/readme.txt', 'not markdown')
    const blob = await zip.generateAsync({ type: 'blob' })

    const patch = await importZip(blob)

    expect(patch.Project?.['readme.txt']?.content).toBe('not markdown')
  })

  // Regression test for issue #27: a ZIP entry whose path segments are a
  // crafted XSS/path-traversal payload must come out of importZip already
  // neutralized (sanitizeNameSegment applied), never as raw attacker input.
  it('sanitizes a malicious project/file name embedded in a crafted ZIP entry path', async () => {
    const zip = new JSZip()
    const maliciousProjectSegment = '<img src=x onerror=alert(1)>'
    const maliciousFileSegment = '../../etc/passwd<script>alert(2)</script>'
    zip.file(`${maliciousProjectSegment}/${maliciousFileSegment}.md`, 'payload content')
    const blob = await zip.generateAsync({ type: 'blob' })

    const patch = await importZip(blob)

    const projectNames = Object.keys(patch)
    expect(projectNames).toHaveLength(1)
    const projectName = projectNames[0] ?? ''

    // Path separators / leading dots (structural traversal abuse) must be
    // stripped from both the project and file name.
    expect(projectName).not.toContain('/')
    expect(projectName).not.toContain('\\')

    const fileNames = Object.keys(patch[projectName] ?? {})
    expect(fileNames).toHaveLength(1)
    const fileName = fileNames[0] ?? ''
    expect(fileName).not.toContain('/')
    expect(fileName).not.toContain('..')

    // sanitizeNameSegment does not strip HTML metacharacters by design
    // (callers must escapeHtml at render time) — but it must not have
    // thrown, corrupted the content, or allowed path traversal.
    expect(patch[projectName]?.[fileName]?.content).toBe('payload content')
  })

  it('rejects a ZIP entry path attempting to traverse outside the project structure via ../', async () => {
    const zip = new JSZip()
    zip.file('Project/../../../etc/passwd.md', 'should not escape')
    const blob = await zip.generateAsync({ type: 'blob' })

    const patch = await importZip(blob)

    // No project/file name may contain raw ".." after sanitization.
    for (const [projectName, files] of Object.entries(patch)) {
      expect(projectName.includes('..')).toBe(false)
      for (const fileName of Object.keys(files)) {
        expect(fileName.includes('..')).toBe(false)
      }
    }
  })
})
