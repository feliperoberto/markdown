import type { JSX } from 'preact'
import { memo } from 'preact/compat'
import { useRef, useState } from 'preact/hooks'
import type { ProjectFile } from './types'
import { showPromptDialog } from './dialogs'
import { Checkbox, IconButton } from '@/components'
import { formatRelativeTime } from '@/lib/formatRelativeTime'

export interface FileRowProps {
  projectName: string
  file: ProjectFile
  isActive: boolean
  isSelected: boolean
  fileNames: string[]
  onSelectFile: (projectName: string, fileName: string) => void
  onToggleSelected: (projectName: string, fileName: string, selected: boolean) => void
  onRenameFile: (projectName: string, oldFileName: string, newFileName: string) => void
  onDeleteFile: (projectName: string, fileName: string) => void
}

// Renders one file row in the sidebar tree, including swipe-to-reveal
// actions (touch) and the multi-select checkbox used for batch download.
// Wrapped in memo() so editing the active file's content doesn't reconcile
// every OTHER file row in the sidebar on every keystroke — effective only
// as long as `fileNames` is itself a stable reference (see ProjectGroup,
// which memoizes it), since a fresh array every render would defeat this.
export const FileRow = memo(function FileRow({
  projectName,
  file,
  isActive,
  isSelected,
  fileNames,
  onSelectFile,
  onToggleSelected,
  onRenameFile,
  onDeleteFile,
}: FileRowProps): JSX.Element {
  const [isSwiped, setIsSwiped] = useState(false)
  const touchStartX = useRef(0)

  function handleTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? 0
  }

  function handleTouchMove(e: TouchEvent) {
    const currentX = e.touches[0]?.clientX ?? 0
    const diff = touchStartX.current - currentX
    if (diff > 40) setIsSwiped(true)
    else if (diff < -20) setIsSwiped(false)
  }

  function handleRowClick() {
    if (isSwiped) {
      setIsSwiped(false)
      return
    }
    onSelectFile(projectName, file.name)
  }

  function handleRowKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleRowClick()
    }
  }

  async function handleRename(e: MouseEvent) {
    e.stopPropagation()
    setIsSwiped(false)
    const trimmed = await showPromptDialog({
      title: 'Renomear arquivo',
      label: 'Novo nome do arquivo',
      defaultValue: file.name,
      validate: (value) => {
        if (!value) return 'Digite um nome para o arquivo.'
        if (value !== file.name && fileNames.includes(value))
          return 'Já existe um arquivo com esse nome.'
        return null
      },
    })
    if (!trimmed || trimmed === file.name) return
    onRenameFile(projectName, file.name, trimmed)
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation()
    setIsSwiped(false)
    onDeleteFile(projectName, file.name)
  }

  return (
    <div
      className={`file-item${isActive ? ' active' : ''}${isSwiped ? ' swiped' : ''}`}
      role="button"
      tabIndex={0}
      aria-current={isActive ? 'true' : undefined}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <span role="presentation" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          label={`Selecionar ${file.name} para download em lote`}
          onChange={(checked) => onToggleSelected(projectName, file.name, checked)}
        />
      </span>
      <span className="file-info">
        <span className="file-name">{file.name}</span>
        <span className="file-timestamp" title={new Date(file.timestamp).toLocaleString()}>
          editado {formatRelativeTime(new Date(file.timestamp).getTime())}
        </span>
      </span>
      <div className="file-actions">
        <IconButton
          variant="compact"
          className="file-action-btn rename"
          icon="✏️"
          label={`Renomear arquivo ${file.name}`}
          onClick={handleRename}
        />
        <IconButton
          variant="compact"
          className="file-action-btn delete"
          icon="🗑"
          label={`Excluir arquivo ${file.name}`}
          onClick={handleDelete}
        />
      </div>
    </div>
  )
})
