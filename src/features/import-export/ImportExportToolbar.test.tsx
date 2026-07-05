import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/preact'
import { useState } from 'preact/hooks'
import { ToastProvider } from '@/components'
import { JSZip } from './zip'
import { ImportExportToolbar } from './ImportExportToolbar'
import type { ProjectsPatch } from './types'

/**
 * Harness mirroring how the app shell wires the toolbar's `onImport`
 * callback into its file list: it flattens every imported patch's file
 * names into a plain list, so the test can assert "import ZIP → files
 * appear" against real rendered output rather than a mocked callback.
 */
function Harness() {
  const [fileNames, setFileNames] = useState<string[]>([])

  function handleImport(patch: ProjectsPatch) {
    const names = Object.values(patch).flatMap((files) => Object.keys(files))
    setFileNames((current) => [...current, ...names])
  }

  return (
    <ToastProvider>
      <ImportExportToolbar
        onImport={handleImport}
        currentFile={null}
        currentProjectName={null}
        currentProjectFiles={null}
        batchSelection={[]}
      />
      <ul>
        {fileNames.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </ToastProvider>
  )
}

async function buildZipFile(): Promise<File> {
  const zip = new JSZip()
  zip.file('My Project/notes.md', '# Notes')
  zip.file('My Project/todo.md', '# Todo')
  const blob = await zip.generateAsync({ type: 'blob' })
  return new File([blob], 'export.zip', { type: 'application/zip' })
}

describe('ImportExportToolbar', () => {
  it('imports files from a selected ZIP and surfaces them to the caller', async () => {
    const { container } = render(<Harness />)

    const zipInput = container.querySelector('input[accept=".zip"]') as HTMLInputElement
    expect(zipInput).not.toBeNull()

    const zipFile = await buildZipFile()
    fireEvent.change(zipInput, { target: { files: [zipFile] } })

    await waitFor(() => expect(screen.queryByText('notes')).not.toBeNull())
    expect(screen.queryByText('todo')).not.toBeNull()
  })
})
