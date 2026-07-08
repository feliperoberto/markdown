import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { EditorFeature } from '@/features/editor'
import { ProjectsSidebar, useProjects } from '@/features/projects'
import {
  ImportExportToolbar,
  importFile,
  exportProject,
  exportProjectFileName,
} from '@/features/import-export'
import type { BatchSelectionEntry } from '@/features/import-export'
import { DriveSyncPanel } from '@/features/drive-sync'
import { PwaInstallPrompt } from '@/features/pwa-install'
import { ThemeToggle } from '@/features/theme'
import { FullscreenToggle } from '@/features/fullscreen'
import { IconButton, useToast } from '@/components'

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
    importProjects,
    restoreProjects,
  } = useProjects()

  const [batchSelection, setBatchSelection] = useState<
    ReadonlyArray<{ projectName: string; fileName: string }>
  >([])

  // Mobile sidebar drawer (issue: the sidebar had no way to dismiss on
  // narrow viewports). Desktop CSS ignores this class entirely (the
  // `.sidebar-hidden` transform only applies inside the @media(max-width:
  // 768px) block in global.css), so this is a no-op above that breakpoint.
  const [sidebarHiddenOnMobile, setSidebarHiddenOnMobile] = useState(true)

  const showToast = useToast()

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
      await navigator.clipboard.writeText(activeContent)
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
  const currentProjectFiles = currentProject ? (projects[currentProject] ?? null) : null

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

  const batchSelectionEntries: BatchSelectionEntry[] = batchSelection.flatMap(
    ({ projectName, fileName }) => {
      const file = projects[projectName]?.[fileName]
      return file ? [{ projectName, fileName, file }] : []
    },
  )

  return (
    <div className="app-shell">
      <header className="app-toolbar">
        <IconButton
          icon="☰"
          label="Abrir menu de projetos"
          ariaExpanded={!sidebarHiddenOnMobile}
          ariaControls="projectsSidebar"
          onClick={() => setSidebarHiddenOnMobile((hidden) => !hidden)}
        />
        <ImportExportToolbar
          onImport={importProjects}
          currentFile={currentFileEntry}
          currentProjectName={currentProject}
          currentProjectFiles={currentProjectFiles}
          batchSelection={batchSelectionEntries}
        />
        <DriveSyncPanel getSnapshot={() => ({ projects })} onImported={restoreProjects} />
        <ThemeToggle />
        <FullscreenToggle />
        <PwaInstallPrompt />
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
        />
        <main className="app-main">
          {currentProject && currentFile ? (
            <EditorFeature
              content={activeContent}
              onContentChange={handleContentChange}
              onCopy={handleCopy}
            />
          ) : (
            <p>Nenhum arquivo selecionado</p>
          )}
        </main>
      </div>
    </div>
  )
}
