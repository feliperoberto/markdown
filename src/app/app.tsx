import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { EditorFeature, FontSizeButton, useEditorFontSize } from '@/features/editor'
import { ProjectsSidebar, useProjects } from '@/features/projects'
import {
  importFile,
  importZip,
  exportFile,
  exportFileName,
  exportProject,
  exportProjectFileName,
  exportBatch,
  exportBatchFileName,
} from '@/features/import-export'
import type { BatchSelectionEntry } from '@/features/import-export'
import { DriveSyncPanel } from '@/features/drive-sync'
import { PwaInstallPrompt } from '@/features/pwa-install'
import { ThemeToggle } from '@/features/theme'
import { FullscreenToggle } from '@/features/fullscreen'
import { SplashScreen } from '@/features/onboarding'
import { BatchDownloadArea, Breadcrumbs, IconButton, useToast } from '@/components'
import { copyToClipboard } from '@/lib/copyToClipboard'

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

// Shell wiring together the extracted projects/files sidebar (#19), the
// editor/preview pane (#18), the import/export toolbar (#20), the
// Google Drive sync panel (#21), and the PWA install experience (#26) —
// all composed with the shared component library (#22).
export function App(): JSX.Element {
  const {
    projects,
    currentProject,
    currentFile,
    selectFile,
    createProject,
    createFile,
    renameFile,
    deleteFile,
    renameProject,
    deleteProject,
    updateFileContent,
    moveFile,
    moveProject,
    importProjects,
    reconcileWithRemote,
  } = useProjects()

  const [batchSelection, setBatchSelection] = useState<
    ReadonlyArray<{ projectName: string; fileName: string }>
  >([])

  // Incrementing this opens the Drive/Config modal from a second entry
  // point (the sidebar's "⚙️ Config" footer button, matching the
  // prototype's separate gear icon) without spawning a second
  // DriveSyncPanel instance with its own disconnected state. Starts
  // `undefined` (not 0) — DriveSyncPanel treats "any defined value" as
  // an open request, so starting at a defined number would pop the
  // modal open immediately on mount.
  const [driveConfigOpenSignal, setDriveConfigOpenSignal] = useState<number | undefined>(undefined)

  // Sidebar drawer visibility. Starts `false` (visible) matching the
  // prototype's static markup, which never has a `hidden` class on
  // `#sidebar` at load — the sidebar is always open on first paint at
  // every viewport width; only explicit user actions (hamburger click,
  // outside click, or selecting a file on mobile) close it. `.sidebar-
  // hidden`'s CSS now applies at every width (previously mobile-only),
  // so this state genuinely drives visibility everywhere, not just <768px.
  const [sidebarHiddenOnMobile, setSidebarHiddenOnMobile] = useState(false)

  // Clicking outside the drawer closes it too (issue: previously the
  // hamburger button was the ONLY way to close it — the prototype's
  // `document.addEventListener('click', ...)` closes on any click outside
  // #sidebar/#menuBtn, at every viewport width, matching this effect).
  //
  // Also ignores clicks inside any open dialog/modal (issue: confirming
  // "Novo projeto"/"Novo arquivo" etc. clicks a button that's portal-
  // mounted to document.body via dialogs.tsx's mountDialog() — outside
  // #projectsSidebar/#sidebarMenuButton by definition — which bubbles up
  // to this listener and silently closed the sidebar every time a dialog
  // was confirmed, on every viewport width including desktop).
  useEffect(() => {
    if (sidebarHiddenOnMobile) return

    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node
      const sidebarEl = document.getElementById('projectsSidebar')
      const menuButtonEl = document.getElementById('sidebarMenuButton')
      if (sidebarEl?.contains(target) || menuButtonEl?.contains(target)) return
      if (target instanceof Element && target.closest('[role="dialog"]')) return
      setSidebarHiddenOnMobile(true)
    }

    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [sidebarHiddenOnMobile])

  const showToast = useToast()
  const { cycleFontSize } = useEditorFontSize()

  const activeContent =
    currentProject && currentFile ? (projects[currentProject]?.[currentFile]?.content ?? '') : ''

  const handleContentChange = (content: string) => {
    if (currentProject && currentFile) {
      updateFileContent(currentProject, currentFile, content)
    }
  }

  const handleCopy = async () => {
    if (!activeContent) {
      showToast('Arquivo vazio', 'warning')
      return
    }
    try {
      await copyToClipboard(activeContent)
      showToast('📋 Copiado', 'success')
    } catch (error) {
      showToast(
        `Erro ao copiar: ${(error as Error)?.message ?? 'não foi possível copiar'}`,
        'error',
      )
    }
  }

  const currentFileEntry =
    currentProject && currentFile ? (projects[currentProject]?.[currentFile] ?? null) : null

  // Per-project "Baixar projeto"/"Upload" menu actions (issue: these
  // existed in the prototype's project dropdown but the functions they
  // need — exportProject/importFile — live in the import-export feature,
  // which `projects` may not import directly (see CONTRIBUTING.md
  // "Feature taxonomy"). app.tsx already composes both features, so the
  // actual calls live here and are threaded down as callback props.
  const handleExportProjectFromMenu = async (projectName: string) => {
    const files = projects[projectName]
    if (!files) return
    try {
      const blob = await exportProject(projectName, files)
      downloadBlob(blob, exportProjectFileName(projectName))
      showToast(`Projeto "${projectName}" exportado`, 'success')
    } catch (error) {
      showToast(`Erro ao exportar projeto: ${(error as Error).message}`, 'error')
    }
  }

  const handleUploadFileToProject = async (projectName: string, file: File) => {
    try {
      const entry = await importFile(file)
      createFile(projectName, entry.name, entry.content)
      showToast(`Arquivo "${entry.name}" importado`, 'success')
    } catch (error) {
      showToast(`Erro ao importar arquivo: ${(error as Error).message}`, 'error')
    }
  }

  // Not in the prototype (its per-project menu only has single-file
  // Upload) — kept reachable per explicit discussion rather than
  // removed, since multi-file import is a real capability, not UI noise.
  const handleUploadMultipleFilesToProject = async (projectName: string, files: File[]) => {
    let successCount = 0
    for (const file of files) {
      try {
        const entry = await importFile(file)
        createFile(projectName, entry.name, entry.content)
        successCount++
      } catch (error) {
        showToast(`Erro ao importar "${file.name}": ${(error as Error).message}`, 'error')
      }
    }
    if (successCount > 0) {
      showToast(`${successCount} arquivo(s) importado(s)`, 'success')
    }
  }

  // Sidebar-footer "📥 Importar" (ZIP) — same taxonomy reason as above.
  const handleImportZip = async (file: File) => {
    try {
      const patch = await importZip(file)
      importProjects(patch)
      const fileCount = Object.values(patch).reduce(
        (total, files) => total + Object.keys(files).length,
        0,
      )
      showToast(`${fileCount} arquivo(s) importado(s) do ZIP`, 'success')
    } catch (error) {
      showToast(`Erro ao importar ZIP: ${(error as Error).message}`, 'error')
    }
  }

  // Per-file download icon next to the breadcrumb (matching the
  // prototype's .btn-download) — replaces the removed header toolbar's
  // "Exportar arquivo" button, which had no equivalent in the prototype.
  const handleDownloadCurrentFile = () => {
    if (!currentFileEntry) return
    const blob = exportFile(currentFileEntry)
    downloadBlob(blob, exportFileName(currentFileEntry))
    showToast('📥 Baixado', 'success')
  }

  const handleDownloadBatch = async () => {
    if (batchSelectionEntries.length === 0) return
    try {
      const blob = await exportBatch(batchSelectionEntries)
      downloadBlob(blob, exportBatchFileName())
      showToast('📦 Baixado', 'success')
    } catch (error) {
      showToast(`Erro ao criar ZIP: ${(error as Error).message}`, 'error')
    }
  }

  const batchSelectionEntries: BatchSelectionEntry[] = batchSelection.flatMap(
    ({ projectName, fileName }) => {
      const file = projects[projectName]?.[fileName]
      return file ? [{ projectName, fileName, file }] : []
    },
  )

  const showBatchArea = batchSelectionEntries.length > 1

  return (
    <>
      <SplashScreen />
      <div className="app-shell">
        <header className="app-toolbar">
          <div className="header-left">
            <IconButton
              id="sidebarMenuButton"
              icon="☰"
              label="Abrir menu de projetos"
              ariaExpanded={!sidebarHiddenOnMobile}
              ariaControls="projectsSidebar"
              onClick={() => setSidebarHiddenOnMobile((hidden) => !hidden)}
            />
            <div className="header-brand">
              <span className="brand-chip" aria-hidden="true" />
              <span className="header-title">Marcar</span>
            </div>
          </div>
          <div className="header-right">
            <DriveSyncPanel
              getSnapshot={() => ({ projects })}
              reconcile={(remote) => ({
                projects: reconcileWithRemote(remote?.projects ?? null),
              })}
              openSignal={driveConfigOpenSignal}
            />
            <FontSizeButton onCycle={cycleFontSize} />
            <ThemeToggle />
            <FullscreenToggle />
            <PwaInstallPrompt />
          </div>
        </header>
        <div className="app-body">
          <ProjectsSidebar
            projects={projects}
            currentProject={currentProject}
            currentFile={currentFile}
            onSelectFile={selectFile}
            onCreateProject={createProject}
            onCreateFile={createFile}
            onRenameFile={renameFile}
            onDeleteFile={deleteFile}
            onRenameProject={renameProject}
            onDeleteProject={deleteProject}
            onSelectionChange={setBatchSelection}
            mobileHidden={sidebarHiddenOnMobile}
            onExportProject={handleExportProjectFromMenu}
            onUploadFile={handleUploadFileToProject}
            onUploadMultipleFiles={handleUploadMultipleFilesToProject}
            onImportZip={handleImportZip}
            onOpenConfig={() => setDriveConfigOpenSignal((n) => (n ?? 0) + 1)}
            onMoveFile={moveFile}
            onMoveProject={moveProject}
          />
          <main className="app-main">
            <div className="toolbar">
              <Breadcrumbs projectName={currentProject} fileName={currentFile} />
              <IconButton
                icon="⬇️"
                label="Baixar arquivo atual"
                title="Baixar arquivo"
                disabled={!currentFileEntry}
                onClick={handleDownloadCurrentFile}
              />
            </div>
            {showBatchArea ? (
              <BatchDownloadArea entries={batchSelectionEntries} onDownload={handleDownloadBatch} />
            ) : (
              <EditorFeature
                content={activeContent}
                onContentChange={handleContentChange}
                onCopy={handleCopy}
              />
            )}
          </main>
        </div>
      </div>
    </>
  )
}
