import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { EditorFeature } from '@/features/editor'
import { ProjectsSidebar, useProjects } from '@/features/projects'
import { ImportExportToolbar } from '@/features/import-export'
import type { BatchSelectionEntry } from '@/features/import-export'
import { DriveSyncPanel } from '@/features/drive-sync'
import { PwaInstallPrompt } from '@/features/pwa-install'
import { IconButton } from '@/components'

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

  const activeContent =
    currentProject && currentFile ? (projects[currentProject]?.[currentFile]?.content ?? '') : ''

  const handleContentChange = (content: string) => {
    if (currentProject && currentFile) {
      updateFileContent(currentProject, currentFile, content)
    }
  }

  const currentFileEntry =
    currentProject && currentFile ? (projects[currentProject]?.[currentFile] ?? null) : null
  const currentProjectFiles = currentProject ? (projects[currentProject] ?? null) : null

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
        <DriveSyncPanel
          getSnapshot={() => ({ projects })}
          onImported={(imported) => restoreProjects(imported as typeof projects)}
        />
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
        />
        <main className="app-main">
          {currentProject && currentFile ? (
            <EditorFeature content={activeContent} onContentChange={handleContentChange} />
          ) : (
            <p>Nenhum arquivo selecionado</p>
          )}
        </main>
      </div>
    </div>
  )
}
