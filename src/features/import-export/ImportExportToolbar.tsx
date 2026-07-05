import type { JSX } from 'preact'
import { useRef } from 'preact/hooks'
import { Button } from '@/components'
import { useToast } from '@/components'
import { importFile } from './importFile'
import { importZip } from './importZip'
import { exportFile, exportFileName } from './exportFile'
import { exportProject, exportProjectFileName } from './exportProject'
import { exportBatch, exportBatchFileName } from './exportBatch'
import type { BatchSelectionEntry, FileEntry, ProjectFiles, ProjectsPatch } from './types'

export interface ImportExportToolbarProps {
  /** Merges an import result into the caller's project store. */
  onImport: (patch: ProjectsPatch) => void
  /** Currently open file, if any — enables single-file export. */
  currentFile: FileEntry | null
  /** Currently open project's name + files, if any — enables project export. */
  currentProjectName: string | null
  currentProjectFiles: ProjectFiles | null
  /** Files checked via the sidebar's multi-select checkboxes. */
  batchSelection: BatchSelectionEntry[]
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * App-shell toolbar wiring the import/export feature (#20) into the UI.
 * Owns only the file-input plumbing and status toasts; all actual
 * parsing/serialization stays in this feature's pure functions.
 */
export function ImportExportToolbar({
  onImport,
  currentFile,
  currentProjectName,
  currentProjectFiles,
  batchSelection,
}: ImportExportToolbarProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)
  const showToast = useToast()

  async function handleFileSelected(event: JSX.TargetedEvent<HTMLInputElement>) {
    const files = Array.from((event.target as HTMLInputElement).files ?? [])
    ;(event.target as HTMLInputElement).value = ''
    if (files.length === 0) return

    if (!currentProjectName) {
      showToast('Selecione um projeto', 'warning')
      return
    }

    const importedNames: string[] = []
    const errors: string[] = []
    const filesPatch: ProjectFiles = {}

    for (const file of files) {
      try {
        const entry = await importFile(file)
        filesPatch[entry.name] = entry
        importedNames.push(entry.name)
      } catch (error) {
        errors.push((error as Error).message)
      }
    }

    if (importedNames.length > 0) {
      onImport({ [currentProjectName]: filesPatch })
      const message =
        importedNames.length === 1
          ? `Arquivo "${importedNames[0]}" importado`
          : `${importedNames.length} arquivo(s) importado(s)`
      showToast(message, 'success')
    }

    if (errors.length > 0) {
      showToast(`Erro ao importar arquivo: ${errors.join(', ')}`, 'error')
    }
  }

  async function handleZipSelected(event: JSX.TargetedEvent<HTMLInputElement>) {
    const file = (event.target as HTMLInputElement).files?.[0]
    ;(event.target as HTMLInputElement).value = ''
    if (!file) return

    try {
      const patch = await importZip(file)
      onImport(patch)
      const projectCount = Object.keys(patch).length
      showToast(`${projectCount} projeto(s) importado(s) do ZIP`, 'success')
    } catch (error) {
      showToast(`Erro ao importar ZIP: ${(error as Error).message}`, 'error')
    }
  }

  function handleExportFile() {
    if (!currentFile) return
    downloadBlob(exportFile(currentFile), exportFileName(currentFile))
    showToast(`Arquivo "${currentFile.name}" exportado`, 'success')
  }

  async function handleExportProject() {
    if (!currentProjectName || !currentProjectFiles) return
    try {
      const blob = await exportProject(currentProjectName, currentProjectFiles)
      downloadBlob(blob, exportProjectFileName(currentProjectName))
      showToast(`Projeto "${currentProjectName}" exportado`, 'success')
    } catch (error) {
      showToast(`Erro ao exportar projeto: ${(error as Error).message}`, 'error')
    }
  }

  async function handleExportBatch() {
    if (batchSelection.length === 0) return
    try {
      const blob = await exportBatch(batchSelection)
      downloadBlob(blob, exportBatchFileName())
      showToast(`${batchSelection.length} arquivo(s) exportado(s)`, 'success')
    } catch (error) {
      showToast(`Erro ao exportar seleção: ${(error as Error).message}`, 'error')
    }
  }

  return (
    <div className="import-export-toolbar" role="toolbar" aria-label="Importar e exportar">
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,text/markdown"
        multiple
        hidden
        onChange={handleFileSelected}
      />
      <input ref={zipInputRef} type="file" accept=".zip" hidden onChange={handleZipSelected} />

      <Button variant="default" onClick={() => fileInputRef.current?.click()}>
        Importar arquivo
      </Button>
      <Button variant="default" onClick={() => zipInputRef.current?.click()}>
        Importar ZIP
      </Button>
      <Button variant="default" disabled={!currentFile} onClick={handleExportFile}>
        Exportar arquivo
      </Button>
      <Button variant="default" disabled={!currentProjectName} onClick={handleExportProject}>
        Exportar projeto
      </Button>
      <Button variant="default" disabled={batchSelection.length === 0} onClick={handleExportBatch}>
        Exportar seleção ({batchSelection.length})
      </Button>
    </div>
  )
}
