import type { JSX } from 'preact'
import { EditorFeature } from '@/features/editor'
import { ProjectsSidebar, useProjects } from '@/features/projects'

// Shell wiring the extracted projects/files sidebar (issue #19) together
// with the editor/preview pane (issue #18). Import/export (#20) and
// drive-sync (#21) are being built out in parallel and will compose into
// this shell later.
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
  } = useProjects()

  const activeContent =
    currentProject && currentFile ? (projects[currentProject]?.[currentFile]?.content ?? '') : ''

  const handleContentChange = (content: string) => {
    if (currentProject && currentFile) {
      updateFileContent(currentProject, currentFile, content)
    }
  }

  return (
    <div className="app-shell">
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
      />
      <main className="app-main">
        {currentProject && currentFile ? (
          <EditorFeature content={activeContent} onContentChange={handleContentChange} />
        ) : (
          <p>Nenhum arquivo selecionado</p>
        )}
      </main>
    </div>
  )
}
