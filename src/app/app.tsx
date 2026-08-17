import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
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
import { DriveSyncPanel, DriveConfigPanel, useDriveSync } from '@/features/drive-sync'
import { PwaInstallPrompt } from '@/features/pwa-install'
import { PwaUpdatePrompt } from '@/features/pwa-update'
import { ThemeToggle } from '@/features/theme'
import { FullscreenToggle } from '@/features/fullscreen'
import { SplashScreen } from '@/features/onboarding'
import { BatchDownloadArea, Breadcrumbs, IconButton, useToast } from '@/components'
import { copyToClipboard } from '@/lib/copyToClipboard'
import { useOutsideClick } from '@/lib/useOutsideClick'
import { useSaveShortcut } from '@/lib/useSaveShortcut'

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
// Google Drive sync panel (#21), the PWA install experience (#26), and the
// PWA update prompt (ADR-0003) — all composed with the shared component
// library (#22).
export function App(): JSX.Element {
  const {
    projects,
    currentProject,
    currentFile,
    selectFile,
    createProject,
    createFile,
    createFiles,
    renameFile,
    deleteFile,
    renameProject,
    deleteProject,
    updateFileContent,
    moveFile,
    moveProject,
    archivedProjects,
    toggleProjectArchived,
    archivedFiles,
    toggleFileArchived,
    importProjects,
    reconcileWithRemote,
  } = useProjects()

  const [batchSelection, setBatchSelection] = useState<
    ReadonlyArray<{ projectName: string; fileName: string }>
  >([])

  // Single source of truth for all Drive connection/sync/config state
  // (issue #110) — shared between DriveSyncPanel (cloud header button,
  // sync-only) and DriveConfigPanel (sidebar gear button, config-only) so
  // the two panels can never disagree about whether Drive is connected or
  // configured.
  const driveSync = useDriveSync({
    reconcile: (remote) => {
      const result = reconcileWithRemote(remote?.projects ?? null, remote?.tombstones)
      return { projects: result.projects, tombstones: result.tombstones }
    },
  })

  // Modal state for the Drive config panel.
  const [configModalOpen, setConfigModalOpen] = useState(false)

  const openConfigModal = () => {
    setConfigModalOpen(true)
  }

  // "Fire an event" signal for DriveSyncPanel from the Ctrl+S/Cmd+S
  // shortcut (useSaveShortcut, wired below). Bumped instead of calling
  // anything on DriveSyncPanel directly, since composing editor +
  // drive-sync behavior belongs here in src/app/, not in either feature
  // (see CONTRIBUTING.md's "Feature taxonomy"). Starts `undefined` —
  // DriveSyncPanel treats any defined value as a request, so starting
  // defined would fire on mount — and `nonce` (not just `action`) is what
  // actually triggers the effect, so two same requests in a row are each
  // observed.
  const [driveSyncSignal, setDriveSyncSignal] = useState<
    { action: 'sync'; nonce: number } | undefined
  >(undefined)

  const requestDriveSync = () =>
    setDriveSyncSignal((prev) => ({ action: 'sync', nonce: (prev?.nonce ?? 0) + 1 }))
  useSaveShortcut(requestDriveSync)

  // Cloud icon behavior: open the config panel if Drive isn't set up and
  // connected yet (`needsConfig`), otherwise sync directly. Uses the same
  // `needsConfig` value as DriveSyncPanel's Ctrl+S handler (see its doc
  // comment on `useDriveSync`) so the two entry points can't diverge.
  const handleCloudButtonClick = () => {
    if (driveSync.needsConfig) {
      openConfigModal()
    } else {
      void driveSync.sync()
    }
  }

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
  // #sidebar/#menuBtn, at every viewport width, matching this behavior).
  //
  // Also ignores clicks inside any open dialog/modal (issue: confirming
  // "Novo projeto"/"Novo arquivo" etc. clicks a button that's portal-
  // mounted to document.body via dialogs.tsx's mountDialog() — outside
  // #projectsSidebar/#sidebarMenuButton by definition — which bubbles up
  // to this listener and silently closed the sidebar every time a dialog
  // was confirmed, on every viewport width including desktop).
  useOutsideClick(
    !sidebarHiddenOnMobile,
    (target) => {
      const sidebarEl = document.getElementById('projectsSidebar')
      const menuButtonEl = document.getElementById('sidebarMenuButton')
      if (sidebarEl?.contains(target) || menuButtonEl?.contains(target)) return true
      return target instanceof Element && target.closest('[role="dialog"]') !== null
    },
    () => setSidebarHiddenOnMobile(true),
  )

  const showToast = useToast()
  const { cycleFontSize } = useEditorFontSize()

  // A newly created/selected file becomes the active one — on a narrow
  // viewport the drawer is an absolute overlay covering the editor (see
  // global.css's `@media (max-width: 768px)`, same breakpoint used here),
  // so without this the file becomes active behind the sidebar and
  // nothing appears to happen. Checked at call time rather than tracked
  // as state: `.sidebar-hidden` applies at every viewport width (see
  // sidebarHiddenOnMobile's own comment above), so this must stay scoped
  // to genuinely narrow viewports or it would also close the sidebar on
  // desktop on every create, where it isn't overlapping anything and
  // closing it is just disruptive. Only wired to paths that actually
  // select the new file: the create-file dialog and upload (see
  // handleUploadFilesToProject below, which selects the last file it
  // creates). Deliberately not on plain file selection — that would fight
  // the drag-to-reorder handle, which lives in the sidebar.
  const revealNewFileOnMobile = () => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      setSidebarHiddenOnMobile(true)
    }
  }

  const handleCreateFile = (projectName: string, fileName: string, content?: string) => {
    createFile(projectName, fileName, content)
    revealNewFileOnMobile()
  }

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

  // One "Upload" menu item covers 1..N files — the file picker itself lets
  // the user choose how many to select, so there's no reason to keep a
  // separate single-file path.
  //
  // Read every file first, then create them all through ONE `createFiles`
  // call — not one `createFile` call per file inside this loop.
  // `createFile` closes over the `projects` value from whenever *this*
  // render's `handleUploadFilesToProject` was created; since that
  // reference doesn't advance between `await`s within a single
  // invocation, a per-file loop of `createFile` calls each persisted from
  // the same stale pre-loop snapshot, and each call's plain `setProjects`
  // overwrite discarded the previous one's file — silently keeping only
  // the last import while still reporting every file as a success.
  // `createFiles` avoids this by folding all entries into one state
  // transition before persisting once, and returns the names it actually
  // created so the last one can be selected below.
  //
  // Returns whether anything was actually created — ProjectsSidebar reveals
  // a collapsed target project only once this resolves `true`, so a batch
  // that fails entirely (every file rejected, or every name collided)
  // doesn't expand the project for nothing.
  const handleUploadFilesToProject = async (
    projectName: string,
    files: File[],
  ): Promise<boolean> => {
    const entries: { name: string; content: string }[] = []
    for (const file of files) {
      try {
        const entry = await importFile(file)
        entries.push({ name: entry.name, content: entry.content })
      } catch (error) {
        showToast(`Erro ao importar "${file.name}": ${(error as Error).message}`, 'error')
      }
    }
    if (entries.length === 0) return false
    const created = createFiles(projectName, entries)
    if (created.length === 0) return false
    selectFile(projectName, created[created.length - 1]!)
    revealNewFileOnMobile()
    // Names the file when exactly one was uploaded, matching the old
    // single-file-only toast — the generic count only kicks in for an
    // actual batch, where naming every file would be unwieldy.
    if (created.length === 1) {
      showToast(`Arquivo "${created[0]}" importado`, 'success')
    } else {
      showToast(`${created.length} arquivo(s) importado(s)`, 'success')
    }
    return true
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
      <PwaUpdatePrompt />
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
              needsConfig={driveSync.needsConfig}
              isOnline={driveSync.isOnline}
              sync={driveSync.sync}
              actionSignal={driveSyncSignal}
              onClickCloudButton={handleCloudButtonClick}
              onRequestConfig={openConfigModal}
            />
            <DriveConfigPanel
              open={configModalOpen}
              onClose={() => setConfigModalOpen(false)}
              connected={driveSync.connected}
              userName={driveSync.userName}
              busy={driveSync.busy}
              isOnline={driveSync.isOnline}
              lastSyncedAt={driveSync.lastSyncedAt}
              configured={driveSync.configured}
              storedClientId={driveSync.storedClientId}
              connect={driveSync.connect}
              disconnect={driveSync.disconnect}
              saveClientId={driveSync.saveClientId}
              clearClientId={driveSync.clearClientId}
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
            onCreateFile={handleCreateFile}
            onRenameFile={renameFile}
            onDeleteFile={deleteFile}
            onRenameProject={renameProject}
            onDeleteProject={deleteProject}
            onSelectionChange={setBatchSelection}
            mobileHidden={sidebarHiddenOnMobile}
            onExportProject={handleExportProjectFromMenu}
            onUploadFiles={handleUploadFilesToProject}
            onImportZip={handleImportZip}
            onOpenConfig={openConfigModal}
            onMoveFile={moveFile}
            onMoveProject={moveProject}
            archivedProjects={archivedProjects}
            onToggleArchived={toggleProjectArchived}
            archivedFiles={archivedFiles}
            onToggleFileArchived={toggleFileArchived}
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
